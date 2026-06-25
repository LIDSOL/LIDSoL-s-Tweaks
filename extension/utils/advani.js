'use strict';

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';

function createBezier(x1, y1, x2, y2) {
    return [
        new Graphene.Point({ x: x1, y: y1 }),
        new Graphene.Point({ x: x2, y: y2 }),
    ];
}

export const AdvAnimationMode = {
    LowBackover: 2000,
    MiddleBackover: 2001,
};

const AdvAnimationModeDefines = [
    {
        mode: Clutter.AnimationMode.CUBIC_BEZIER,
        getCubicBezierProgress: () => createBezier(0.225, 1.2, 0.45, 1),
    },
    {
        mode: Clutter.AnimationMode.CUBIC_BEZIER,
        getCubicBezierProgress: () => createBezier(0.4, 1.35, 0.55, 1),
    },
];

export function ease(actor, params) {
    let modeDefine = null;
    if (params.mode > Clutter.AnimationMode.ANIMATION_LAST) {
        modeDefine = AdvAnimationModeDefines[params.mode - AdvAnimationMode.LowBackover];
        params.mode = modeDefine.mode;
    }

    actor.ease(params);
    if (!modeDefine) return;

    let { getCubicBezierProgress, cubicBezierProgress } = modeDefine;
    if (getCubicBezierProgress) cubicBezierProgress = getCubicBezierProgress();
    if (cubicBezierProgress) {
        for (const key in params) {
            const transition = actor.get_transition(key.replace(/_/g, '-'));
            if (!transition) continue;
            transition.set_cubic_bezier_progress(...cubicBezierProgress);
        }
    }
}
