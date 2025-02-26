import React from 'react';
import {
    Button,
    Tooltip,
} from '@mui/material';
import {
    Download as DownloadIcon,
} from '@mui/icons-material';

const TaskExporter = ({ tasks, interactions }) => {
    const generateCsv = () => {
        // CSV Headers
        const headers = [
            'Task Name',
            'Task Description',
            'Subtask Description',
            'Subtask Order',
            'Interaction Type',
            'Element Tag',
            'Element Class',
            'Element Text',
            'Element XPath',
            'Timestamp',
            'Task Completion Status',
            'Subtask Completion Status'
        ].join(',');

        // Generate CSV rows
        const rows = tasks.flatMap(task => {
            return task.subtasks.flatMap((subtask, subtaskIndex) => {
                // Get interactions for this subtask
                const startIndex = subtaskIndex === 0 
                    ? task.startInteractionIndex 
                    : task.subtasks[subtaskIndex - 1].interactionEndIndex + 1;
                const endIndex = subtask.interactionEndIndex;

                // If subtask isn't completed, don't include its interactions
                if (!subtask.isCompleted || endIndex < 0) return [];

                const subtaskInteractions = interactions.slice(startIndex, endIndex + 1);
                
                return subtaskInteractions.map(interaction => {
                    // Clean text content for CSV
                    const cleanText = (text) => {
                        if (!text) return '';
                        // Remove commas and quotes, replace newlines
                        return text.replace(/["',\n\r]/g, ' ').trim();
                    };

                    // Format data for CSV
                    const rowData = [
                        cleanText(task.name),
                        cleanText(task.description),
                        cleanText(subtask.description),
                        subtaskIndex + 1,
                        interaction.type,
                        interaction.element.tagName,
                        cleanText(interaction.element.className),
                        cleanText(interaction.element.text),
                        cleanText(interaction.element.xpath),
                        interaction.timestamp,
                        task.subtasks.every(s => s.isCompleted) ? 'Complete' : 'Incomplete',
                        subtask.isCompleted ? 'Complete' : 'Incomplete'
                    ];

                    return rowData.join(',');
                });
            });
        });

        // Combine headers and rows
        const csv = [headers, ...rows].join('\n');
        return csv;
    };

    const handleExport = () => {
        try {
            const csv = generateCsv();
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `task_interactions_${new Date().toISOString()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting CSV:', error);
        }
    };

    // Only enable export if there are completed tasks with interactions
    const hasCompletedInteractions = tasks.some(task => 
        task.subtasks.some(subtask => 
            subtask.isCompleted && subtask.interactionEndIndex >= 0
        )
    );

    return (
        <Tooltip title={
            !hasCompletedInteractions 
                ? "Complete some tasks to enable export" 
                : "Export tasks and interactions as CSV"
        }>
            <span>
                <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={handleExport}
                    disabled={!hasCompletedInteractions}
                    size="small"
                >
                    Export Data
                </Button>
            </span>
        </Tooltip>
    );
};

export default TaskExporter;