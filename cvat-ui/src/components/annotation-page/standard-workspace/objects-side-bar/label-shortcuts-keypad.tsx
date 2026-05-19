// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Row, Col, Dropdown } from 'antd';
import { Label, LabelType, ObjectType, ShapeType } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';
import { rememberObject, updateAnnotationsAsync } from 'actions/annotation-actions';
import GlobalHotKeys, { KeyMapItem } from 'utils/mousetrap-react';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import { ShortcutScope } from 'utils/enums';
import { subKeyMap } from 'utils/component-subkeymap';
import { useResetShortcutsOnUnmount } from 'utils/hooks';
import { getCVATStore } from 'cvat-store';
import message from 'antd/lib/message';

interface ShortcutLabelMap {
    [key: string]: number | null;
}

interface Props {
    labels: Label[];
}

// Number keys for shortcuts (displayed as 1-0)
const SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const componentShortcuts: Record<string, KeyMapItem> = {};

for (const key of SHORTCUT_KEYS) {
    componentShortcuts[`LABEL_KEYPAD_${key}`] = {
        name: '标签快捷键',
        description: '通过数字键快速切换标签',
        sequences: [key],
        nonActive: true,
        scope: ShortcutScope.OBJECTS_SIDEBAR,
    };
}

registerComponentShortcuts(componentShortcuts);

function LabelShortcutsKeypad(props: Props): JSX.Element {
    const { labels } = props;
    const dispatch = useDispatch();
    const keyMap: Record<string, KeyMapItem> = useSelector((state: CombinedState) => state.shortcuts.keyMap);

    // Map from shortcut key string ('1'-'9', '0') to label ID
    const [shortcutMap, setShortcutMap] = useState<ShortcutLabelMap>(() => {
        const initial: ShortcutLabelMap = {};
        for (const key of SHORTCUT_KEYS) {
            initial[key] = null;
        }
        // Default: first 10 labels map to 1-0
        for (let i = 0; i < Math.min(10, labels.length); i++) {
            initial[SHORTCUT_KEYS[i]] = labels[i].id as number;
        }
        return initial;
    });

    // Track which dropdown is open
    const [openKey, setOpenKey] = useState<string | null>(null);

    useResetShortcutsOnUnmount(componentShortcuts);

    // Initialize map when labels change
    useEffect(() => {
        const newMap: ShortcutLabelMap = {};
        for (const key of SHORTCUT_KEYS) {
            // Keep existing assignments if they still exist in labels
            const existingLabelID = shortcutMap[key];
            if (existingLabelID && labels.some((l) => l.id === existingLabelID)) {
                newMap[key] = existingLabelID;
            } else {
                newMap[key] = null;
            }
        }
        // Auto-assign unassigned labels
        let keyIndex = 0;
        for (const label of labels) {
            while (keyIndex < SHORTCUT_KEYS.length && newMap[SHORTCUT_KEYS[keyIndex]] !== null) {
                keyIndex++;
            }
            if (keyIndex < SHORTCUT_KEYS.length) {
                newMap[SHORTCUT_KEYS[keyIndex]] = label.id as number;
                keyIndex++;
            }
        }
        setShortcutMap(newMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [labels.length]);

    const applyLabelByID = useCallback((labelID: number | null) => {
        if (!labelID) return;

        const label = labels.find((l) => l.id === labelID);
        if (!label) return;

        const relevantAppState = getCVATStore().getState();
        const { states, activatedStateID } = relevantAppState.annotation.annotations;
        const { activeShapeType, activeObjectType } = relevantAppState.annotation.drawing;

        if (Number.isInteger(activatedStateID)) {
            const activatedState = states.filter((state: any) => state.clientID === activatedStateID)[0];
            const bothAreTags = activatedState.objectType === ObjectType.TAG && label.type === LabelType.TAG;
            const labelIsApplicable = label.type === LabelType.ANY ||
                (activatedState.shapeType === label.type && activatedState.shapeType !== ShapeType.SKELETON) ||
                bothAreTags;

            if (activatedState && labelIsApplicable) {
                activatedState.label = label;
                dispatch(updateAnnotationsAsync([activatedState]));
            }
        } else {
            if (label.type === LabelType.TAG) {
                dispatch(rememberObject({ activeLabelID: labelID, activeObjectType: ObjectType.TAG }, false));
            } else if (label.type === LabelType.MASK) {
                dispatch(rememberObject({
                    activeLabelID: labelID,
                    activeObjectType: ObjectType.SHAPE,
                    activeShapeType: ShapeType.MASK,
                }, false));
            } else {
                dispatch(rememberObject({
                    activeLabelID: labelID,
                    activeObjectType: activeObjectType !== ObjectType.TAG ? activeObjectType : ObjectType.SHAPE,
                    activeShapeType: label.type === LabelType.ANY && activeShapeType !== ShapeType.SKELETON ?
                        activeShapeType : label.type as unknown as ShapeType,
                }, false));
            }

            message.destroy();
            message.success(`默认标签已切换为 "${label.name}"`);
        }
    }, [dispatch, labels]);

    // Handlers for registered shortcuts
    const handlers: Record<string, (event?: KeyboardEvent) => void> = {};
    for (const key of SHORTCUT_KEYS) {
        handlers[`LABEL_KEYPAD_${key}`] = (event?: KeyboardEvent) => {
            if (event) event.preventDefault();
            const labelID = shortcutMap[key];
            if (labelID) {
                applyLabelByID(labelID);
            }
        };
    }

    // Handle dropdown selection change
    const onSelectLabel = (key: string, value: string) => {
        const newMap = { ...shortcutMap };
        newMap[key] = value ? Number.parseInt(value, 10) : null;
        setShortcutMap(newMap);
        setOpenKey(null);
    };

    // Grid layout: 3 columns, 4 rows (3+3+3+1)
    const rows: string[][] = [
        SHORTCUT_KEYS.slice(0, 3),
        SHORTCUT_KEYS.slice(3, 6),
        SHORTCUT_KEYS.slice(6, 9),
        SHORTCUT_KEYS.slice(9, 10),
    ];

    const getLabelName = (key: string): string => {
        const labelID = shortcutMap[key];
        if (!labelID) return '?';
        const label = labels.find((l) => l.id === labelID);
        return label ? label.name : '?';
    };

    const getLabelColor = (key: string): string => {
        const labelID = shortcutMap[key];
        if (!labelID) return '#cccccc';
        const label = labels.find((l) => l.id === labelID);
        return label?.color || '#cccccc';
    };

    const menuItems = (key: string) => labels.map((label) => ({
        key: `${label.id}`,
        label: label.name,
        onClick: () => onSelectLabel(key, `${label.id}`),
    }));

    return (
        <div className='cvat-label-shortcuts-keypad'>
            <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={handlers} />
            <Row gutter={[4, 4]}>
                {rows.map((rowKeys, rowIdx) => (
                    <Col key={rowIdx} span={24}>
                        <Row gutter={[4, 4]} justify={rowIdx === 3 ? 'center' : 'start'}>
                            {rowKeys.map((key) => {
                                const labelID = shortcutMap[key];
                                const hasLabel = !!labelID;
                                const color = getLabelColor(key);

                                return (
                                    <Col key={key} span={8}>
                                        <Dropdown
                                            trigger={['click']}
                                            open={openKey === key}
                                            onOpenChange={(open) => setOpenKey(open ? key : null)}
                                            menu={{ items: menuItems(key) }}
                                            placement='topLeft'
                                        >
                                            <div
                                                className={`cvat-label-shortcut-key ${hasLabel ? 'assigned' : 'unassigned'}`}
                                                title='点击选择标签，按下数字键切换标签'
                                            >
                                                <span className='cvat-label-shortcut-key-number'>{key}</span>
                                                <span
                                                    className='cvat-label-shortcut-color-dot'
                                                    style={{ background: color }}
                                                />
                                                <span className='cvat-label-shortcut-key-name'>{getLabelName(key)}</span>
                                            </div>
                                        </Dropdown>
                                    </Col>
                                );
                            })}
                        </Row>
                    </Col>
                ))}
            </Row>
        </div>
    );
}

export default React.memo(LabelShortcutsKeypad);
