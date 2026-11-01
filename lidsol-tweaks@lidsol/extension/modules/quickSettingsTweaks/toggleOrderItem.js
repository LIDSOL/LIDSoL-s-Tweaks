'use strict';

import GObject from 'gi://GObject';

export function match(a, b) {
    if (a.isSystem !== b.isSystem || a.nonOrdered !== b.nonOrdered || a.hide !== b.hide)
        return false;
    if (a.nonOrdered) return true;
    if (a.isSystem) return a.constructorName === b.constructorName;
    return (
        a.constructorName === b.constructorName
        && a.titleRegex === b.titleRegex
        && a.friendlyName === b.friendlyName
        && a.gtypeName === b.gtypeName
    );
}

export function toggleMatch(item, toggle) {
    if (item.nonOrdered) return false;
    if (item.gtypeName && GObject.type_name_from_instance(toggle) !== item.gtypeName)
        return false;
    if (item.constructorName && toggle.constructor.name !== item.constructorName)
        return false;
    if (item.cachedTitleRegex && toggle.title?.match?.(item.cachedTitleRegex) == null)
        return false;
    if (!item.gtypeName && !item.constructorName && !item.cachedTitleRegex)
        return false;
    return true;
}

export const DefaultItem = {
    hide: false,
    titleRegex: '',
    constructorName: '',
    friendlyName: '',
    gtypeName: '',
};

export function createItem(friendlyName) {
    return { ...DefaultItem, friendlyName };
}
