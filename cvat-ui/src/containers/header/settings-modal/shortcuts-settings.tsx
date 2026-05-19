// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { CombinedState } from 'reducers';
import { shortcutsActions } from 'actions/shortcuts-actions';
import ShortcutsSettingsComponent from 'components/header/settings-modal/shortcut-settings';

function ShortcutsSettingsContainer(): JSX.Element {
    const keyMap = useSelector((state: CombinedState) => state.shortcuts.keyMap);
    const dispatch = useDispatch();

    const onKeySequenceUpdate = (shortcutID: string, updatedSequence: string[]): void => {
        dispatch(shortcutsActions.registerShortcuts({
            ...keyMap,
            [shortcutID]: {
                ...keyMap[shortcutID],
                sequences: updatedSequence,
            },
        }));
    };

    return (
        <ShortcutsSettingsComponent
            keyMap={keyMap}
            onKeySequenceUpdate={onKeySequenceUpdate}
        />
    );
}

export default ShortcutsSettingsContainer;
