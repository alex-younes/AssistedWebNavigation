import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, IconButton, Collapse } from '@mui/material';
import { Star, StarBorder, EmojiEvents, ExpandMore, ExpandLess } from '@mui/icons-material';

const StarRating = ({ rating, criteria }) => {
    const [expanded, setExpanded] = useState(false);

    const handleExpandClick = () => {
        setExpanded(!expanded);
    };

    const getStarColor = (rating) => {
        if (rating === 3) return '#FFD700'; // Gold
        if (rating === 2) return '#C0C0C0'; // Silver
        if (rating === 1) return '#CD7F32'; // Bronze
        return '#757575'; // Default gray
    };

    const getRatingText = (rating) => {
        if (!criteria?.levels) return '';
        
        const level = criteria.levels.find(l => l.stars === rating);
        return level?.description || '';
    };

    return (
        <Card sx={{ flexShrink: 0 }}>
            <CardContent sx={{ p: '8px', '&:last-child': { pb: '8px' } }}>
                <Box sx={{ 
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1
                }}>
                    {/* Main Rating Display */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <EmojiEvents sx={{ fontSize: '16px' }} color="primary" />
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {[1, 2, 3].map((star) => (
                                <Box key={star}>
                                    {star <= rating ? (
                                        <Star sx={{ 
                                            color: getStarColor(rating),
                                            fontSize: '18px'
                                        }} />
                                    ) : (
                                        <StarBorder sx={{ 
                                            color: '#757575',
                                            fontSize: '18px'
                                        }} />
                                    )}
                                </Box>
                            ))}
                        </Box>
                        <Typography 
                            variant="caption"
                            color="primary"
                            sx={{ fontWeight: 500 }}
                        >
                            {getRatingText(rating)}
                        </Typography>
                    </Box>

                    {/* Expand/Collapse Button */}
                    <IconButton 
                        size="small"
                        onClick={handleExpandClick}
                        sx={{ 
                            p: 0.5,
                            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                        }}
                    >
                        {expanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                </Box>

                {/* Collapsible Criteria */}
                <Collapse in={expanded} timeout="auto" unmountOnExit>
                    <Box sx={{ mt: 1, maxHeight: '120px', overflow: 'auto' }}>
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                            gap: 0.5,
                            px: 0.5
                        }}>
                            {criteria?.levels?.map((level, index) => (
                                <Box 
                                    key={index}
                                    sx={{ 
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        p: 0.5,
                                        borderRadius: 1,
                                        bgcolor: level.stars === rating ? 'action.selected' : 'transparent',
                                        border: '1px solid',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Box sx={{ display: 'flex', gap: 0.25, minWidth: 35 }}>
                                        {[...Array(level.stars)].map((_, i) => (
                                            <Star 
                                                key={i}
                                                sx={{ 
                                                    color: getStarColor(level.stars),
                                                    fontSize: '12px'
                                                }}
                                            />
                                        ))}
                                    </Box>
                                    <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                                        {level.description}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Collapse>
            </CardContent>
        </Card>
    );
};

export default StarRating;