const starRatingConfig = {
    levels: [
        { threshold: 5, stars: 3, label: "Expert", description: "5 or less interactions = 3★" },
        { threshold: 10, stars: 2, label: "Intermediate", description: "6-10 interactions = 2★" },
        { threshold: 15, stars: 1, label: "Beginner", description: "11-15 interactions = 1★" }
    ],
    defaultStars: 0,
    criteriaText: "Rating Criteria: ",
    
    // Add method to calculate stars based on interactions
    calculateStars: function(totalInteractions) {
        // Sort levels by threshold in ascending order
        const sortedLevels = [...this.levels].sort((a, b) => a.threshold - b.threshold);
        
        // Start with default stars
        let earnedStars = this.defaultStars;
        
        // Check each level
        for (const level of sortedLevels) {
            if (totalInteractions <= level.threshold) {
                earnedStars = level.stars;
                break;
            }
        }
        
        return earnedStars;
    }
};

module.exports = starRatingConfig; 