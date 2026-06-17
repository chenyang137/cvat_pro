// Copyright (C) 2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import Card from 'antd/lib/card';
import Descriptions from 'antd/lib/descriptions';
import { LoadingOutlined, MoreOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

import { Job, JobType } from 'cvat-core-wrapper';
import { useCardHeightHOC, useContextMenuClick, useIsMounted } from 'utils/hooks';
import Preview from 'components/common/preview';
import { CombinedState } from 'reducers';
import JobActionsComponent from './actions-menu';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const useCardHeight = useCardHeightHOC({
    containerClassName: 'cvat-jobs-page',
    siblingClassNames: ['cvat-jobs-page-pagination', 'cvat-jobs-page-top-bar'],
    paddings: 80,
    minHeight: 200,
    numberOfRows: 3,
});

interface Props {
    job: Job;
    selected: boolean;
    onClick: (event: React.MouseEvent) => boolean;
    onApplyFilter?: (filter: string | null) => void;
}

function JobCardComponent(props: Readonly<Props>): JSX.Element {
    const {
        job, selected, onClick, onApplyFilter,
    } = props;

    const deletes = useSelector((state: CombinedState) => state.jobs.activities.deletes);
    const deleted = job.id in deletes ? deletes[job.id] === true : false;

    const history = useHistory();
    const height = useCardHeight();
    const { itemRef, handleContextMenuClick, handleContextMenuCapture } = useContextMenuClick<HTMLDivElement>();
    const isMounted = useIsMounted();

    const [issueSummary, setIssueSummary] = useState<{ resolved: number; unresolved: number } | null>(null);

    useEffect(() => {
        if (job.type !== JobType.GROUND_TRUTH) {
            job.issues()
                .then((issues: any[]) => {
                    if (isMounted()) {
                        setIssueSummary({
                            resolved: issues.filter((issue: any) => issue.resolved).length,
                            unresolved: issues.filter((issue: any) => !issue.resolved).length,
                        });
                    }
                })
                .catch(() => {
                    if (isMounted()) {
                        setIssueSummary({ resolved: 0, unresolved: 0 });
                    }
                });
        }
    }, [job.id]);

    const handleCardClick = useCallback((event: React.MouseEvent): void => {
        const cancel = onClick(event);
        if (!cancel) {
            const url = `/tasks/${job.taskId}/jobs/${job.id}`;
            if (event.ctrlKey) {
                window.open(url, '_blank', 'noopener noreferrer');
            } else {
                history.push(url);
            }
        }
    }, [job, onClick]);

    const style = {};
    if (deleted) {
        (style as any).pointerEvents = 'none';
        (style as any).opacity = 0.5;
    }

    let tag = null;
    if (job.type === JobType.GROUND_TRUTH) {
        tag = '真值';
    } else if (job.replicasCount > 0) {
        tag = '父级';
    } else if (job.parentJobId !== null) {
        tag = '副本';
    }

    const stageMap: Record<string, string> = {
        annotation: '标注',
        validation: '审核',
        acceptance: '验收',
    };
    const stateMap: Record<string, string> = {
        new: '未开始',
        'in progress': '进行中',
        rejected: '已拒绝',
        completed: '已完成',
    };

    const createdFromNow = job.createdDate ? dayjs(job.createdDate).fromNow() : '-';
    const updatedFromNow = job.updatedDate ? dayjs(job.updatedDate).fromNow() : '-';
    const frameCount = job.stopFrame - job.startFrame + 1;

    const cardClassName = `cvat-job-page-list-item${selected ? ' cvat-item-selected' : ''}`;

    /* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
    const card = (
        <Card
            ref={itemRef}
            style={{ ...style, height }}
            className={cardClassName}
            cover={(
                <>
                    <Preview
                        job={job}
                        onClick={handleCardClick}
                        loadingClassName='cvat-job-item-loading-preview'
                        emptyPreviewClassName='cvat-job-item-empty-preview'
                        previewWrapperClassName='cvat-jobs-page-job-item-card-preview-wrapper'
                        previewClassName='cvat-jobs-page-job-item-card-preview'
                    />
                    <div className='cvat-job-page-list-item-id'>
                        ID:
                        {` ${job.id}`}
                    </div>
                    {tag && <div className='cvat-job-page-list-item-type'>{tag}</div>}
                    <div className='cvat-job-page-list-item-dimension'>{job.dimension.toUpperCase()}</div>
                </>
            )}
            hoverable
            onClick={onClick}
            onContextMenuCapture={handleContextMenuCapture}
        >
            <Descriptions column={1} size='small'>
                <Descriptions.Item label='阶段'>
                    {stageMap[job.stage] ?? job.stage}
                </Descriptions.Item>
                <Descriptions.Item label='状态'>
                    {stateMap[job.state] ?? job.state}
                </Descriptions.Item>
                <Descriptions.Item label='创建时间'>{createdFromNow}</Descriptions.Item>
                <Descriptions.Item label='更新时间'>{updatedFromNow}</Descriptions.Item>
                <Descriptions.Item label='帧的数量'>{frameCount}</Descriptions.Item>
                <Descriptions.Item label='标注人员'>
                    {job.assignee ? job.assignee.username : ' '}
                </Descriptions.Item>
                {job.type !== JobType.GROUND_TRUTH && (
                    <Descriptions.Item label='已解决问题'>
                        {issueSummary === null ? <LoadingOutlined /> : issueSummary.resolved}
                    </Descriptions.Item>
                )}
                {job.type !== JobType.GROUND_TRUTH && (
                    <Descriptions.Item label='未解决问题'>
                        {issueSummary === null ? <LoadingOutlined /> : issueSummary.unresolved}
                    </Descriptions.Item>
                )}
            </Descriptions>
            <div
                onClick={handleContextMenuClick}
                className='cvat-job-card-more-button cvat-actions-menu-button'
            >
                <MoreOutlined className='cvat-menu-icon' />
            </div>
        </Card>
    );

    return (
        <JobActionsComponent
            jobInstance={job}
            dropdownTrigger={['contextMenu']}
            triggerElement={card}
            onApplyFilter={onApplyFilter}
        />
    );
}

export default React.memo(JobCardComponent);
