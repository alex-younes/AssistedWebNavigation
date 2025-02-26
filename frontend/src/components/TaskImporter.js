import React, { useRef, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    List,
    ListItem,
    ListItemText,
    Chip,
    IconButton,
    Tooltip,
    Snackbar,
    Alert,
} from '@mui/material';
import {
    Upload as UploadIcon,
    Delete as DeleteIcon,
    Add as AddIcon,
} from '@mui/icons-material';

const TaskImporter = ({ onImportTasks }) => {
    const [previewTasks, setPreviewTasks] = useState([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [alert, setAlert] = useState({ open: false, message: '', severity: 'info' });
    const fileInputRef = useRef();

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = JSON.parse(e.target.result);
                
                if (!Array.isArray(content)) {
                    throw new Error('JSON must contain an array of tasks');
                }

                const validatedTasks = content.map(task => {
                    if (!task.name || typeof task.name !== 'string') {
                        throw new Error('Each task must have a name');
                    }

                    if (!Array.isArray(task.subtasks)) {
                        throw new Error('Each task must have a subtasks array');
                    }

                    return {
                        name: task.name,
                        description: task.description || '',
                        subtasks: task.subtasks.map(subtask => ({
                            description: subtask.description
                        }))
                    };
                });

                setPreviewTasks(validatedTasks);
                setIsDialogOpen(true);
            } catch (error) {
                setAlert({
                    open: true,
                    message: `Error importing tasks: ${error.message}`,
                    severity: 'error'
                });
            }
        };

        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    };

    const handleImport = () => {
        onImportTasks(previewTasks);
        setIsDialogOpen(false);
        setPreviewTasks([]);
        setAlert({
            open: true,
            message: `Successfully imported ${previewTasks.length} tasks`,
            severity: 'success'
        });
    };

    const removeTask = (index) => {
        setPreviewTasks(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <>
            <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileChange}
            />
            
            <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                size="small"
            >
                Import Tasks
            </Button>

            <Dialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>Import Tasks Preview</DialogTitle>
                <DialogContent>
                    {previewTasks.length === 0 ? (
                        <Typography color="textSecondary" align="center">
                            No tasks to import
                        </Typography>
                    ) : (
                        <List>
                            {previewTasks.map((task, index) => (
                                <ListItem
                                    key={index}
                                    secondaryAction={
                                        <IconButton
                                            edge="end"
                                            onClick={() => removeTask(index)}
                                            size="small"
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    }
                                >
                                    <ListItemText
                                        primary={task.name}
                                        secondary={
                                            <Box sx={{ mt: 1 }}>
                                                {task.description && (
                                                    <Typography
                                                        variant="body2"
                                                        color="textSecondary"
                                                        gutterBottom
                                                    >
                                                        {task.description}
                                                    </Typography>
                                                )}
                                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                    {task.subtasks.map((subtask, subtaskIndex) => (
                                                        <Chip
                                                            key={subtaskIndex}
                                                            label={subtask.description}
                                                            size="small"
                                                            variant="outlined"
                                                        />
                                                    ))}
                                                </Box>
                                            </Box>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleImport}
                        variant="contained"
                        color="primary"
                        disabled={previewTasks.length === 0}
                        startIcon={<AddIcon />}
                    >
                        Import Tasks
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={alert.open}
                autoHideDuration={6000}
                onClose={() => setAlert({ ...alert, open: false })}
            >
                <Alert 
                    onClose={() => setAlert({ ...alert, open: false })} 
                    severity={alert.severity}
                    sx={{ width: '100%' }}
                >
                    {alert.message}
                </Alert>
            </Snackbar>
        </>
    );
};

export default TaskImporter;