// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import Text from 'antd/lib/typography/Text';
import { Row, Col } from 'antd/lib/grid';
import Button from 'antd/lib/button';
import { MoreOutlined } from '@ant-design/icons';
import Progress from 'antd/lib/progress';
import Badge from 'antd/lib/badge';
import { Task, RQStatus, Request, JobStage, JobState, getCore } from 'cvat-core-wrapper';
import Preview from 'components/common/preview';
import { ActiveInference, PluginComponent } from 'reducers';
import StatusMessage from 'components/requests-page/request-status';
import { useContextMenuClick, useIsMounted } from 'utils/hooks';
import AutomaticAnnotationProgress from './automatic-annotation-progress';
import TaskActionsComponent from './actions-menu';

export interface TaskItemProps {
    taskInstance: any;
    deleted: boolean;
    activeInference: ActiveInference | null;
    activeRequest: Request | null;
    ribbonPlugins: PluginComponent[];
    cancelAutoAnnotation(): void;
    updateTaskInState(task: Task): void;
    selected: boolean;
    onClick: () => void;
}

interface ImportingState {
    state: RQStatus | null;
    message: string;
    progress: number;
}

// 自定义分段进度条：已完成 / 审核中 / 验收中 / 标注中 各用不同颜色
function MultiStageProgressBar(props: {
    total: number;
    completed: number;
    validation: number;
    acceptance: number;
    annotation: number;
}): JSX.Element {
    const { total, completed, validation, acceptance, annotation } = props;
    if (total <= 0) {
        return <div className='cvat-task-item-multi-progress' />;
    }
    const segments = [
        { value: completed, color: '#52c41a' }, // 已完成 - 绿色
        { value: validation, color: '#faad14' }, // 审核中 - 橙色
        { value: acceptance, color: '#13c2c2' }, // 验收中 - 青色
        { value: annotation, color: '#1890ff' }, // 标注中 - 蓝色
    ];
    return (
        <div
            className='cvat-task-item-multi-progress'
            style={{
                display: 'flex',
                width: '100%',
                height: 8,
                background: '#f5f5f5',
                borderRadius: 4,
                overflow: 'hidden',
            }}
        >
            {segments.filter((seg) => seg.value > 0).map((seg) => (
                <div
                    key={seg.color}
                    style={{
                        width: `${(seg.value * 100) / total}%`,
                        background: seg.color,
                        transition: 'width 0.3s ease',
                    }}
                    title={`${seg.value} / ${total}`}
                />
            ))}
        </div>
    );
}

const core = getCore();

function TaskItemComponent(props: TaskItemProps): JSX.Element {
    const {
        taskInstance,
        deleted,
        activeInference,
        activeRequest,
        ribbonPlugins,
        cancelAutoAnnotation,
        updateTaskInState,
        selected,
        onClick,
    } = props;

    const isMounted = useIsMounted();
    const { itemRef, handleContextMenuClick, handleContextMenuCapture } = useContextMenuClick<HTMLDivElement>();

    const [importingState, setImportingState] = useState<ImportingState | null>(
        taskInstance.size > 0 ? null : {
            state: null,
            message: '请求当前进度',
            progress: 0,
        },
    );

    useEffect(() => {
        if (importingState !== null && activeRequest !== null) {
            setImportingState({
                message: activeRequest.message,
                progress: Math.floor((activeRequest.progress ?? 0) * 100),
                state: activeRequest.status,
            });

            taskInstance.listenToCreate(activeRequest.id, {
                callback: (request: Request) => {
                    if (isMounted()) {
                        setImportingState({
                            message: request.message,
                            progress: Math.floor((request.progress ?? 0) * 100),
                            state: request.status,
                        });
                    }
                },
                initialRequest: activeRequest,
            }).then((createdTask: Task) => {
                if (isMounted()) {
                    setImportingState(null);

                    setTimeout(() => {
                        if (isMounted()) {
                            if (taskInstance.size !== createdTask.size) {
                                updateTaskInState(createdTask);
                            }
                        }
                    }, 1000);
                }
            }).catch(() => {});
        }
    }, []);

    const style: React.CSSProperties = {};
    if (deleted) {
        style.pointerEvents = 'none';
        style.opacity = 0.5;
    }

    const { id } = taskInstance;
    const owner = taskInstance.owner ? taskInstance.owner.username : null;
    const updated = dayjs(taskInstance.updatedDate).fromNow();
    const created = dayjs(taskInstance.createdDate).format('YYYY年M月D日');

    const ribbonItems = ribbonPlugins
        .filter((plugin) => plugin.data.shouldBeRendered(props, { importingState }))
        .map((plugin) => ({ component: plugin.component, weight: plugin.data.weight }));

    const [acceptanceJobsCount, setAcceptanceJobsCount] = useState<number | null>(() => {
        // 任务详情页的 taskInstance 已包含 jobs 字段，可以直接统计
        const jobs: any[] | undefined = taskInstance.jobs;
        if (Array.isArray(jobs) && jobs.length) {
            return jobs.filter((j) => j.stage === JobStage.ACCEPTANCE && j.state !== JobState.COMPLETED).length;
        }
        return null;
    });

    useEffect(() => {
        // 如果 jobs 字段已存在（任务详情页）则无需请求
        if (Array.isArray(taskInstance.jobs) && taskInstance.jobs.length) {
            return;
        }
        // 任务列表卡片默认不附带 jobs 详情，需要显式请求
        let cancelled = false;
        core.jobs.get({ taskID: taskInstance.id, pageSize: 1000 })
            .then((jobs) => {
                if (cancelled) return;
                const count = jobs.filter((j: any) =>
                    j.stage === JobStage.ACCEPTANCE && j.state !== JobState.COMPLETED,
                ).length;
                setAcceptanceJobsCount(count);
            })
            .catch(() => {
                if (!cancelled) setAcceptanceJobsCount(0);
            });
        return () => {
            cancelled = true;
        };
    }, [taskInstance.id, taskInstance.jobs]);

    const renderProgress = (): JSX.Element => {
        if (importingState) {
            return (
                <Col span={7}>
                    <Row>
                        <Col span={24} className='cvat-task-item-progress-wrapper'>
                            <div>
                                <StatusMessage
                                    status={importingState.state}
                                    message={importingState.message}
                                />
                            </div>
                            {importingState.state !== RQStatus.FAILED && (
                                <Progress
                                    percent={importingState.progress}
                                    strokeColor='#1890FF'
                                    size='small'
                                />
                            )}
                        </Col>
                    </Row>
                </Col>
            );
        }

        const numOfJobs = taskInstance.progress.totalJobs;
        const numOfCompleted = taskInstance.progress.completedJobs;
        const numOfValidation = taskInstance.progress.validationJobs;
        // numOfAnnotation 是后端算的 = total - completed - validation（也包含 acceptance 阶段）
        // 我们用 acceptance 阶段单独展示，所以从 annotation 总量中扣掉 acceptance 部分
        const numOfAcceptance = acceptanceJobsCount ?? 0;
        const numOfAnnotation = Math.max(
            taskInstance.progress.annotationJobs - numOfAcceptance,
            0,
        );

        return (
            <Col span={7}>
                <Row>
                    <Col span={24} className='cvat-task-item-progress-wrapper'>
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '4px 12px',
                                lineHeight: 1.6,
                            }}
                        >
                            {numOfCompleted > 0 && (
                                <Text strong className='cvat-task-completed-progress' style={{ color: '#52c41a' }}>
                                    {`\u2022 ${numOfCompleted} 已完成`}
                                </Text>
                            )}
                            {numOfValidation > 0 && (
                                <Text strong className='cvat-task-validation-progress' style={{ color: '#faad14' }}>
                                    {`\u2022 ${numOfValidation} 审核中`}
                                </Text>
                            )}
                            {numOfAcceptance > 0 && (
                                <Text strong className='cvat-task-acceptance-progress' style={{ color: '#13c2c2' }}>
                                    {`\u2022 ${numOfAcceptance} 验收中`}
                                </Text>
                            )}
                            {numOfAnnotation > 0 && (
                                <Text strong className='cvat-task-annotation-progress' style={{ color: '#1890ff' }}>
                                    {`\u2022 ${numOfAnnotation} 标注中`}
                                </Text>
                            )}
                            <Text strong type='secondary'>
                                {`\u2022 ${numOfJobs} 共计`}
                            </Text>
                        </div>
                        <MultiStageProgressBar
                            total={numOfJobs}
                            completed={numOfCompleted}
                            validation={numOfValidation}
                            acceptance={numOfAcceptance}
                            annotation={numOfAnnotation}
                        />
                    </Col>
                </Row>
                <AutomaticAnnotationProgress
                    activeInference={activeInference}
                    cancelAutoAnnotation={cancelAutoAnnotation}
                />
            </Col>
        );
    };

    /* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
    const row = (
        <Row
            ref={itemRef}
            className={`cvat-tasks-list-item${selected ? ' cvat-item-selected' : ''}`}
            justify='center'
            align='top'
            style={style}
            onClick={onClick}
            onContextMenuCapture={handleContextMenuCapture}
        >
            <Col span={4}>
                <Preview
                    task={taskInstance}
                    loadingClassName='cvat-task-item-loading-preview'
                    emptyPreviewClassName='cvat-task-item-empty-preview'
                    previewWrapperClassName='cvat-task-item-preview-wrapper'
                    previewClassName='cvat-task-item-preview'
                />
            </Col>
            <Col span={10} className='cvat-task-item-description'>
                <Text ellipsis={{ tooltip: taskInstance.name }}>
                    <Text strong type='secondary' className='cvat-item-task-id'>{`#${id}: `}</Text>
                    <Text strong className='cvat-item-task-name'>{taskInstance.name}</Text>
                </Text>
                <br />
                {owner && (
                    <>
                        <Text type='secondary'>{`创建者：${owner ? `${owner}` : ''}，创建于 ${created}`}</Text>
                        <br />
                    </>
                )}
                <Text type='secondary'>{`最近更新：${updated}`}</Text>
            </Col>
            {renderProgress()}
            <Col span={3}>
                <Row justify='end'>
                    <Col>
                        <Link to={`/tasks/${id}`}>
                            <Button
                                disabled={!!importingState}
                                className='cvat-item-open-task-button'
                                type='primary'
                                size='large'
                                ghost
                            >
                                打开
                            </Button>
                        </Link>
                    </Col>
                </Row>
                <Row justify='end'>
                    <Col className='cvat-item-open-task-actions'>
                        <div
                            onClick={handleContextMenuClick}
                            className='cvat-task-item-actions-button cvat-actions-menu-button'
                        >
                            <Text className='cvat-text-color'>操作</Text>
                            <MoreOutlined className='cvat-menu-icon' />
                        </div>
                    </Col>
                </Row>
            </Col>
        </Row>
    );

    return (
        <Badge.Ribbon
            style={{ visibility: ribbonItems.length ? 'visible' : 'hidden' }}
            className='cvat-task-item-ribbon'
            placement='start'
            text={(
                <div>
                    {ribbonItems.sort((item1, item2) => item1.weight - item2.weight)
                        .map((item) => item.component).map((Component, index) => (
                            <Component key={index} targetProps={props} targetState={{ importingState }} />
                        ))}
                </div>
            )}
        >
            <TaskActionsComponent
                dropdownTrigger={['contextMenu']}
                taskInstance={taskInstance}
                triggerElement={row}
            />
        </Badge.Ribbon>
    );
}

export default React.memo(TaskItemComponent);
