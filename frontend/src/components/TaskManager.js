import React, { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    List,
    ListItem,
    FormControl,
    Select,
    MenuItem,
    InputLabel,
    Chip,
    Tooltip,
    Tabs,
    Tab,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import {
    Add as AddIcon,
    Check as CheckIcon,
    AddTask as AddTaskIcon,
    Delete as DeleteIcon,
} from '@mui/icons-material';
import TaskImporter from './TaskImporter';
import TaskExporter from './TaskExporter';

// Helper function to get element data from interaction
const getElementTagName = (interaction) => {
    // Extension format
    if (interaction.details) {
        return interaction.details.elementType || 'unknown';
    }
    // Headless browser format
    else if (interaction.element && interaction.element.tagName) {
        return interaction.element.tagName;
    }
    // Fallback
    return 'unknown';
};

const SubtaskItem = ({ 
    subtask, 
    interactions, 
    onComplete,
    isRecording,
    previousSubtaskEndIndex = -1,
    canComplete,
    taskStartIndex,
}) => {
    const startIndex = Math.max(previousSubtaskEndIndex + 1, taskStartIndex);
    const endIndex = subtask.isCompleted ? subtask.interactionEndIndex : interactions.length - 1;
    const relevantInteractions = interactions.slice(startIndex, endIndex + 1);

    return (
        <Box sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography
                    variant="body1"
                    sx={{
                        textDecoration: subtask.isCompleted ? 'line-through' : 'none',
                        color: subtask.isCompleted ? 'text.secondary' : 'text.primary'
                    }}
                >
                    {subtask.description}
                </Typography>
                <Tooltip title={!canComplete ? "Complete previous subtasks first" : ""}>
                    <span>
                        <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            startIcon={<CheckIcon />}
                            onClick={() => onComplete(subtask.id)}
                            disabled={subtask.isCompleted || !isRecording || !canComplete}
                        >
                            Finished
                        </Button>
                    </span>
                </Tooltip>
            </Box>
            
            <FormControl fullWidth size="small">
                <InputLabel>Recorded Interactions</InputLabel>
                <Select
                    value=""
                    label="Recorded Interactions"
                    onChange={() => {}}
                >
                    {relevantInteractions.map((interaction, index) => {
                        const actualIndex = startIndex + index;
                        return (
                            <MenuItem key={actualIndex} value={actualIndex}>
                                {`${actualIndex + 1}. ${interaction.type} - ${getElementTagName(interaction)}`}
                            </MenuItem>
                        );
                    })}
                </Select>
            </FormControl>
            {relevantInteractions.length > 0 && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                    {`${relevantInteractions.length} interaction${relevantInteractions.length !== 1 ? 's' : ''} recorded`}
                </Typography>
            )}
        </Box>
    );
};

const CreateTaskDialog = ({ open, onClose, onCreate }) => {
    const [taskName, setTaskName] = useState('');

    const handleCreate = () => {
        if (taskName.trim()) {
            onCreate(taskName);
            setTaskName('');
            onClose();
        }
    };

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    margin="dense"
                    label="Task Name"
                    fullWidth
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleCreate} variant="contained" color="primary">
                    Create
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const TaskManager = ({ interactions, isRecording }) => {
    const [tasks, setTasks] = useState([]);
    const [activeTaskId, setActiveTaskId] = useState(null);
    const [newSubtask, setNewSubtask] = useState('');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    const activeTask = tasks.find(t => t.id === activeTaskId);

    const handleCreateTask = (taskName) => {
        const newTask = {
            id: Date.now().toString(),
            name: taskName,
            description: '',
            subtasks: [],
            createdAt: new Date().toISOString(),
            startInteractionIndex: interactions.length,
        };
        setTasks(prev => [...prev, newTask]);
        setActiveTaskId(newTask.id);
    };

    const handleImportTasks = (importedTasks) => {
        const newTasks = importedTasks.map(task => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: task.name,
            description: task.description || '',
            subtasks: task.subtasks.map(subtask => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                description: subtask.description,
                isCompleted: false,
                interactionEndIndex: -1,
                startFromIndex: interactions.length
            })),
            createdAt: new Date().toISOString(),
            startInteractionIndex: interactions.length
        }));

        setTasks(prev => [...prev, ...newTasks]);
        if (newTasks.length > 0 && !activeTaskId) {
            setActiveTaskId(newTasks[0].id);
        }
    };

    const handleDeleteTask = (taskId) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        if (activeTaskId === taskId) {
            setActiveTaskId(tasks.find(t => t.id !== taskId)?.id || null);
        }
    };

    const handleTaskDescriptionChange = (event) => {
        if (!activeTaskId) return;
        
        setTasks(prev => prev.map(task => 
            task.id === activeTaskId
                ? { ...task, description: event.target.value }
                : task
        ));
    };

    const handleAddSubtask = () => {
        if (!newSubtask.trim() || !activeTaskId) return;

        setTasks(prev => {
            const taskIndex = prev.findIndex(t => t.id === activeTaskId);
            if (taskIndex === -1) return prev;

            const task = prev[taskIndex];
            const lastCompletedSubtask = [...task.subtasks].reverse().find(s => s.isCompleted);
            const startFromIndex = lastCompletedSubtask 
                ? lastCompletedSubtask.interactionEndIndex 
                : task.startInteractionIndex;

            const newSubtaskObj = {
                id: Date.now().toString(),
                description: newSubtask,
                isCompleted: false,
                interactionEndIndex: -1,
                startFromIndex
            };

            const updatedTask = {
                ...task,
                subtasks: [...task.subtasks, newSubtaskObj]
            };

            return [
                ...prev.slice(0, taskIndex),
                updatedTask,
                ...prev.slice(taskIndex + 1)
            ];
        });
        setNewSubtask('');
    };

    const handleSubtaskComplete = (subtaskId) => {
        if (!activeTaskId) return;

        setTasks(prev => {
            const taskIndex = prev.findIndex(t => t.id === activeTaskId);
            if (taskIndex === -1) return prev;

            const task = prev[taskIndex];
            const updatedSubtasks = [...task.subtasks];
            const subtaskIndex = updatedSubtasks.findIndex(s => s.id === subtaskId);
            
            const isNextIncomplete = updatedSubtasks
                .slice(0, subtaskIndex)
                .every(s => s.isCompleted);
            
            if (!isNextIncomplete) return prev;

            updatedSubtasks[subtaskIndex] = {
                ...updatedSubtasks[subtaskIndex],
                isCompleted: true,
                interactionEndIndex: interactions.length - 1
            };

            const updatedTask = {
                ...task,
                subtasks: updatedSubtasks
            };

            return [
                ...prev.slice(0, taskIndex),
                updatedTask,
                ...prev.slice(taskIndex + 1)
            ];
        });
    };

    const getPreviousSubtaskEndIndex = (currentIndex) => {
        if (!activeTask) return -1;
        if (currentIndex === 0) return activeTask.startInteractionIndex;
        const previousSubtask = activeTask.subtasks[currentIndex - 1];
        return previousSubtask?.isCompleted 
            ? previousSubtask.interactionEndIndex 
            : Math.max(previousSubtask.startFromIndex, activeTask.startInteractionIndex);
    };

    const canCompleteSubtask = (currentIndex) => {
        if (!activeTask) return false;
        return activeTask.subtasks
            .slice(0, currentIndex)
            .every(subtask => subtask.isCompleted);
    };

    const getTaskProgress = (task) => {
        if (!task.subtasks.length) return 0;
        return (task.subtasks.filter(s => s.isCompleted).length / task.subtasks.length) * 100;
    };

    return (
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', pb: 1, gap: 1 }}>
                <Typography variant="h6" sx={{ flex: 1 }}>Task Manager</Typography>
                <TaskImporter onImportTasks={handleImportTasks} />
                <Button
                    startIcon={<AddTaskIcon />}
                    onClick={() => setIsCreateDialogOpen(true)}
                    variant="outlined"
                    size="small"
                >
                    New Task
                </Button>
            </CardContent>
            {tasks.length > 0 && (
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="textSecondary" sx={{ flex: 1 }}>
                            {tasks.filter(t => t.subtasks.every(s => s.isCompleted)).length} of {tasks.length} tasks completed
                        </Typography>
                        <TaskExporter tasks={tasks} interactions={interactions} />
                    </Box>
                </CardContent>
            )}
            {tasks.length > 0 ? (
                <>
                    <Tabs
                        value={activeTaskId || false}
                        onChange={(_, newValue) => setActiveTaskId(newValue)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
                    >
                        {tasks.map(task => (
                            <Tab
                                key={task.id}
                                value={task.id}
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <span>{task.name}</span>
                                        <Chip 
                                            size="small" 
                                            label={`${Math.round(getTaskProgress(task))}%`}
                                            color={getTaskProgress(task) === 100 ? "success" : "default"}
                                        />
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteTask(task.id);
                                            }}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                }
                            />
                        ))}
                    </Tabs>
                    <CardContent sx={{ flex: 1, overflow: 'auto', pt: 2 }}>
                        {activeTask ? (
                            <>
                                <TextField
                                    fullWidth
                                    label="Task Description"
                                    variant="outlined"
                                    value={activeTask.description}
                                    onChange={handleTaskDescriptionChange}
                                    multiline
                                    rows={2}
                                    sx={{ mb: 3 }}
                                />
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="subtitle1" sx={{ mb: 1 }}>Subtasks</Typography>
                                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            placeholder="Add a subtask"
                                            value={newSubtask}
                                            onChange={(e) => setNewSubtask(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
                                        />
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            startIcon={<AddIcon />}
                                            onClick={handleAddSubtask}
                                        >
                                            Add
                                        </Button>
                                    </Box>
                                    <List sx={{ p: 0 }}>
                                        {activeTask.subtasks.map((subtask, index) => (
                                            <SubtaskItem
                                                key={subtask.id}
                                                subtask={subtask}
                                                interactions={interactions}
                                                onComplete={handleSubtaskComplete}
                                                isRecording={isRecording}
                                                previousSubtaskEndIndex={getPreviousSubtaskEndIndex(index)}
                                                canComplete={canCompleteSubtask(index)}
                                                taskStartIndex={activeTask.startInteractionIndex}
                                            />
                                        ))}
                                    </List>
                                </Box>
                            </>
                        ) : (
                            <Typography color="textSecondary" align="center">
                                Select a task to view details
                            </Typography>
                        )}
                    </CardContent>
                </>
            ) : (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography color="textSecondary" gutterBottom>
                        No tasks created yet
                    </Typography>
                    <Button
                        startIcon={<AddTaskIcon />}
                        onClick={() => setIsCreateDialogOpen(true)}
                        variant="contained"
                    >
                        Create First Task
                    </Button>
                </Box>
            )}
            <CreateTaskDialog
                open={isCreateDialogOpen}
                onClose={() => setIsCreateDialogOpen(false)}
                onCreate={handleCreateTask}
            />
        </Card>
    );
};

export default TaskManager;
