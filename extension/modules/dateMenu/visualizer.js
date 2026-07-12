'use strict';

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

const CAVA_FIXED_BARS = 64;

let _cavaEngineInstance = null;

class CavaEngine {
  constructor() {
    this._subscribers = new Map();
    this._bins = new Array(CAVA_FIXED_BARS).fill(0);
    this._silentFrames = 0;
    this._rollingMax = 2000;
    this._cavaProcess = null;
    this._cancellable = null;
    this._stdout = null;
    this._tmpConfigPath = null;
    this._bufferUsed = 0;
    this._rawBuffer = new Uint8Array(0);
  }

  subscribe(callback) {
    if (!this._subscribers.has(callback))
      this._subscribers.set(callback, false);
    this._evaluatePlayback();
  }

  unsubscribe(callback) {
    this._subscribers.delete(callback);
    this._evaluatePlayback();
  }

  setPlaying(callback, playing) {
    if (this._subscribers.has(callback)) {
      this._subscribers.set(callback, playing);
      this._evaluatePlayback();
    }
  }

  _evaluatePlayback() {
    let anyPlaying = false;
    for (let isPlaying of this._subscribers.values()) {
      if (isPlaying) { anyPlaying = true; break; }
    }

    if (anyPlaying)
      this._startCava();
    else
      this._stopCava();
    if (!anyPlaying)
      this._broadcast(new Array(CAVA_FIXED_BARS).fill(0), true);
  }

  _startCava() {
    if (this._cavaProcess) return;
    if (!GLib.find_program_in_path('cava')) return;

    let tmpPath = `${GLib.get_tmp_dir()}/lidsol-cava-${GLib.get_monotonic_time()}`;
    let cfg =
      `[general]\nbars = ${CAVA_FIXED_BARS}\nframerate = 60\nautosens = 1\n` +
      `[smoothing]\nmonstercat = 1.5\nnoise_reduction = 60\ngravity = 140\n` +
      `[input]\nmethod = pulse\nsource = auto\n` +
      `[output]\nmethod = raw\nbit_format = 16bit\nchannels = mono\nraw_target = /dev/stdout\n`;

    try {
      GLib.file_set_contents(tmpPath, new TextEncoder().encode(cfg));
      this._tmpConfigPath = tmpPath;
    } catch (e) {
      return;
    }

    try {
      let launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      });
      this._process = launcher.spawnv(['cava', '-p', tmpPath]);
      this._stdout = this._process.get_stdout_pipe();
      this._cancellable = new Gio.Cancellable();
      this._bufferUsed = 0;
      this._rawBuffer = new Uint8Array(8192);
      this._cavaProcess = true;
      this._readStdout();
    } catch (e) {
      this._stopCava();
    }
  }

  _stopCava() {
    if (this._cancellable) {
      this._cancellable.cancel();
      this._cancellable = null;
    }
    if (this._process) {
      try { this._process.force_exit(); } catch (e) { }
      this._process = null;
    }
    if (this._stdout) {
      try { this._stdout.close(null); } catch (e) { }
      this._stdout = null;
    }
    if (this._tmpConfigPath) {
      try {
        let file = Gio.File.new_for_path(this._tmpConfigPath);
        if (file.query_exists(null)) file.delete(null);
      } catch (e) { }
      this._tmpConfigPath = null;
    }
    this._cavaProcess = false;
    this._silentFrames = 30;
    this._bins.fill(0);
  }

  _readStdout() {
    if (!this._stdout || !this._cancellable || this._cancellable.is_cancelled()) return;

    let readSize = Math.max(4096, CAVA_FIXED_BARS * 4);
    this._stdout.read_bytes_async(readSize, GLib.PRIORITY_DEFAULT, this._cancellable,
      (stream, res) => {
        try {
          let gbytes = stream.read_bytes_finish(res);
          if (!gbytes) {
            if (this._stdout && this._cancellable && !this._cancellable.is_cancelled())
              this._readStdout();
            return;
          }

          let chunk = gbytes.get_data();
          if (!chunk || chunk.length === 0) { this._readStdout(); return; }

          let needed = this._bufferUsed + chunk.length;
          if (needed > this._rawBuffer.length) {
            let nb = new Uint8Array(Math.max(needed, this._rawBuffer.length * 2));
            nb.set(this._rawBuffer.subarray(0, this._bufferUsed));
            this._rawBuffer = nb;
          }
          this._rawBuffer.set(chunk, this._bufferUsed);
          this._bufferUsed += chunk.length;

          let frameSize = CAVA_FIXED_BARS * 2;
          let totalFrames = Math.floor(this._bufferUsed / frameSize);

          if (totalFrames > 0) {
            let lastOffset = (totalFrames - 1) * frameSize;
            let dv = new DataView(this._rawBuffer.buffer,
              this._rawBuffer.byteOffset + lastOffset, frameSize);

            let frameMax = 1;
            for (let i = 0; i < CAVA_FIXED_BARS; i++) {
              let v = dv.getUint16(i * 2, true);
              this._bins[i] = v;
              if (v > frameMax) frameMax = v;
            }

            if (frameMax < 100)
              this._silentFrames++;
            else
              this._silentFrames = 0;

            let isSilent = this._silentFrames >= 30;
            let normalizedArray = new Array(CAVA_FIXED_BARS).fill(0);

            if (isSilent) {
              this._rollingMax = 2000;
            } else {
              if (frameMax > this._rollingMax)
                this._rollingMax = frameMax;
              else
                this._rollingMax = this._rollingMax * 0.98 + frameMax * 0.02;

              let invMax = 1 / Math.max(this._rollingMax, 5000);
              for (let i = 0; i < CAVA_FIXED_BARS; i++)
                normalizedArray[i] = Math.min(1.0, this._bins[i] * invMax);
            }

            this._broadcast(normalizedArray, isSilent);

            this._rawBuffer.copyWithin(0, totalFrames * frameSize, this._bufferUsed);
            this._bufferUsed -= totalFrames * frameSize;
          }
          this._readStdout();
        } catch (e) { }
      });
  }

  _broadcast(normalizedBars, isSilent) {
    for (let cb of this._subscribers.keys())
      cb(normalizedBars, isSilent);
  }
}

function getCavaEngine() {
  if (!_cavaEngineInstance)
    _cavaEngineInstance = new CavaEngine();
  return _cavaEngineInstance;
}

function destroyCavaEngine() {
  if (_cavaEngineInstance) {
    _cavaEngineInstance._stopCava();
    _cavaEngineInstance = null;
  }
}

const SimulatedVisualizer = GObject.registerClass(
  class SimulatedVisualizer extends St.BoxLayout {
    _init() {
      super._init({
        style: 'spacing: 2px;',
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.FILL,
        x_expand: true,
      });
      this.layout_manager.orientation = Clutter.Orientation.HORIZONTAL;
      this._bars = [];
      this._mode = 1;
      this._isPlaying = false;
      this._timerId = null;
      this._barCount = 4;
      this._barWidth = 3;
      this.connect('destroy', () => this._cleanup());
    }

    setBarCount(n) {
      this._barCount = n;
      this._rebuildBars();
    }

    _rebuildBars() {
      this.destroy_all_children();
      this._bars = [];
      for (let i = 0; i < this._barCount; i++) {
        let bar = new St.Widget({
          width: this._barWidth,
          y_expand: true,
          y_align: Clutter.ActorAlign.FILL,
        });
        bar.set_pivot_point(0.5, 1.0);
        bar.set_style(`background-color: rgba(255,255,255,0.7); border-radius: 1px;`);
        this.add_child(bar);
        this._bars.push(bar);
      }
      this._updatePivot();
    }

    setMode(m) {
      this._mode = m;
      this._updatePivot();
    }

    _updatePivot() {
      let py = this._mode === 2 ? 0.5 : 1.0;
      this._bars.forEach(b => b.set_pivot_point(0.5, py));
    }

    setPlaying(playing) {
      if (this._isPlaying === playing) return;
      this._isPlaying = playing;

      if (this._timerId) {
        GLib.Source.remove(this._timerId);
        this._timerId = null;
      }

      if (playing) {
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
          if (!this || this.is_finalized?.() || !this.get_parent())
            return GLib.SOURCE_REMOVE;
          this._animate();
          return GLib.SOURCE_CONTINUE;
        });
      } else {
        this._bars.forEach(b => b.scale_y = 0.2);
      }
    }

    _animate() {
      let t = Date.now() / 250;
      let speeds = [1.1, 1.6, 1.3, 1.8, 1.5, 1.2, 1.7, 1.4];
      this._bars.forEach((bar, idx) => {
        let scaleY = 0.2;
        if (this._mode === 1) {
          let wave = (Math.sin(t - idx * 1.0) + 1) / 2;
          scaleY = 0.3 + wave * 0.7;
        } else if (this._mode === 2) {
          let pulse = (Math.sin(t * speeds[idx % speeds.length]) + 1) / 2;
          scaleY = 0.3 + pulse * 0.7;
        }
        bar.scale_y = scaleY;
      });
    }

    _cleanup() {
      if (this._timerId) {
        GLib.Source.remove(this._timerId);
        this._timerId = null;
      }
    }
  });

const CavaVisualizer = GObject.registerClass(
  class CavaVisualizer extends St.DrawingArea {
    _init(barCount) {
      super._init({
        y_expand: true,
        y_align: Clutter.ActorAlign.FILL,
      });
      this._barCount = barCount || 16;
      this._barWidth = 3;
      this._gap = 2;
      this._prevHeights = new Array(this._barCount).fill(1);
      this._peakValues = new Array(this._barCount).fill(0);
      this._isSilent = true;

      this._engine = getCavaEngine();
      this._engineCallback = this._onEngineUpdate.bind(this);
      this._engine.subscribe(this._engineCallback);

      this.connect('repaint', this._onRepaint.bind(this));
      this.connect('destroy', () => {
        this._engine.unsubscribe(this._engineCallback);
      });

      this._updateWidth();
    }

    _updateWidth() {
      let w = this._barCount * (this._barWidth + this._gap) - this._gap;
      this.set_width(Math.max(0, w));
    }

    setBarCount(n) {
      if (n === this._barCount) return;
      this._barCount = n;
      this._prevHeights = new Array(n).fill(1);
      this._peakValues = new Array(n).fill(0);
      this._updateWidth();
    }

    setHeight(h) {
      this.set_height(h);
    }

    setPlaying(playing) {
      this._engine.setPlaying(this._engineCallback, playing);
      if (!playing) {
        this._prevHeights.fill(1);
        this._peakValues.fill(0);
        this._isSilent = true;
        this.queue_repaint();
      }
    }

    _resampleBars(rawData, targetCount) {
      let srcCount = rawData.length;
      if (srcCount === targetCount) return rawData;
      let result = new Array(targetCount).fill(0);
      let ratio = srcCount / targetCount;
      for (let i = 0; i < targetCount; i++) {
        let start = Math.floor(i * ratio);
        let end = Math.floor((i + 1) * ratio);
        let sum = 0, count = 0;
        for (let j = start; j < end && j < srcCount; j++) {
          sum += rawData[j];
          count++;
        }
        result[i] = count > 0 ? (sum / count) : 0;
      }
      return result;
    }

    _onEngineUpdate(normalizedBars, isSilent) {
      if (!this || (this.is_finalized && this.is_finalized()) || !this.mapped) return;

      this._isSilent = isSilent;
      let myBars = this._resampleBars(normalizedBars, this._barCount);

      let totalHeight = this.get_height() || 24;
      let maxHalfHeight = totalHeight / 2;

      for (let i = 0; i < this._barCount; i++) {
        let norm = myBars[i];
        let visualCurve = Math.pow(norm, 0.8);
        let target = Math.max(1, Math.round(visualCurve * maxHalfHeight));

        if (!isSilent && norm > 0 && target < 3) target = 3;

        let prev = this._prevHeights[i];
        let alpha = target < prev ? 0.6 : 0.95;
        let height = Math.round(prev * (1 - alpha) + target * alpha);
        this._prevHeights[i] = height;

        if (height > this._peakValues[i])
          this._peakValues[i] = height;
        else
          this._peakValues[i] -= this._peakValues[i] * 0.06;
      }
      this.queue_repaint();
    }

    _onRepaint() {
      let cr = this.get_context();
      let width = this.get_width();
      let height = this.get_height();
      if (width <= 0 || height <= 0) { cr.$dispose(); return; }

      cr.setOperator(Cairo.Operator.CLEAR);
      cr.paint();
      cr.setOperator(Cairo.Operator.OVER);

      let centerY = Math.floor(height / 2);
      let barCount = this._barCount;
      let barWidth = this._barWidth;
      let gap = this._gap;

      let totalContent = barCount * (barWidth + gap) - gap;
      let offsetX = Math.max(0, Math.floor((width - totalContent) / 2));

      for (let i = 0; i < barCount; i++) {
        let halfHeight = Math.max(1, this._prevHeights[i]);
        let x = offsetX + i * (barWidth + gap);
        let edgeFade = 1 - Math.abs(i - (barCount - 1) / 2) / ((barCount - 1) / 2) * 0.35;
        let alpha = this._isSilent ? 0.3 * edgeFade : 1.0 * edgeFade;

        cr.setSourceRGBA(1, 1, 1, alpha);
        cr.rectangle(x, centerY - halfHeight, barWidth, halfHeight * 2);
        cr.fill();

        if (!this._isSilent) {
          let peak = Math.max(1, this._peakValues[i]);
          cr.setSourceRGBA(1, 1, 1, alpha * 0.55);
          cr.rectangle(x, centerY - peak - 1, barWidth, 1);
          cr.fill();
          cr.rectangle(x, centerY + peak, barWidth, 1);
          cr.fill();
        }
      }
      cr.$dispose();
    }
  });

export { destroyCavaEngine };
export const VisualizerWidget = GObject.registerClass(
  class VisualizerWidget extends St.BoxLayout {
    _init() {
      super._init({
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.FILL,
        x_expand: true,
        visible: false,
      });
      this.layout_manager.orientation = Clutter.Orientation.HORIZONTAL;
      this._mode = 0;
      this._barCount = 4;
      this._height = 24;
      this._isPlaying = false;

      this._simulated = new SimulatedVisualizer();
      this._simulated.set_height(this._height);
      this.add_child(this._simulated);

      this._pauseIcon = new St.Icon({
        icon_name: 'media-playback-pause-symbolic',
        style_class: 'at-a-glance-pause-icon',
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
        icon_size: 12,
        visible: false,
      });
      this.add_child(this._pauseIcon);

      this._cava = null;
    }

    setMode(mode) {
      if (mode === 3 && !GLib.find_program_in_path('cava'))
        mode = 2;

      this._mode = mode;

      if (mode === 3) {
        if (!this._cava) {
          this._cava = new CavaVisualizer(this._barCount);
          this._cava.set_height(this._height);
        }
        this._simulated.visible = false;
        this._simulated.setPlaying(false);
        this._cava.visible = true;
        if (!this._cava.get_parent())
          this.add_child(this._cava);
        this._cava.setPlaying(this._isPlaying);
      } else if (mode > 0) {
        if (this._cava) {
          this._cava.setPlaying(false);
          this._cava.visible = false;
        }
        this._simulated.visible = true;
        this._simulated.setMode(mode);
        this._simulated.setPlaying(this._isPlaying);
      } else {
        if (this._cava) {
          this._cava.setPlaying(false);
          this._cava.visible = false;
        }
        this._simulated.visible = false;
        this._simulated.setPlaying(false);
      }
      this._syncPauseIcon();
    }

    setBarCount(n) {
      this._barCount = n;
      this._simulated.setBarCount(n);
      if (this._cava)
        this._cava.setBarCount(n);
    }

    setVisualizerHeight(h) {
      this._height = h;
      this._simulated.set_height(h);
      if (this._cava)
        this._cava.set_height(h);
    }

    setPlaying(playing) {
      this._isPlaying = playing;
      if (this._mode === 3 && this._cava)
        this._cava.setPlaying(playing);
      else if (this._mode > 0)
        this._simulated.setPlaying(playing);
      this._syncPauseIcon();
    }

    setShowPauseIcon(show) {
      this._showPause = show;
      this._syncPauseIcon();
    }

    _syncPauseIcon() {
      const showing = this._showPause && !this._isPlaying && this._mode > 0;
      this._pauseIcon.visible = showing;
      if (this._mode === 3 && this._cava)
        this._cava.visible = this._isPlaying;
      else
        this._simulated.visible = this._isPlaying;
    }

    _cleanup() {
      if (this._cava) {
        this._cava.setPlaying(false);
        this._cava.destroy();
        this._cava = null;
      }
      if (this._simulated) {
        this._simulated._cleanup();
        this._simulated.destroy();
        this._simulated = null;
      }
    }
  });
