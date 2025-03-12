# Testing the FSM(DOMs) Implementation

This guide explains how to run and test the FSM(DOMs) implementation.

## Prerequisites

1. Node.js and npm installed
2. Backend and frontend applications set up
3. All dependencies installed

## Setup Instructions

### 1. Install Dependencies

Backend:
```bash
cd backend
npm install typescript @types/node crypto-js
```

Frontend:
```bash
cd frontend
npm install @mui/lab react-diff-viewer react-d3-tree puppeteer axios
```

### 2. Start the Applications

1. Start the backend server:
```bash
cd backend
npm start
```

2. In a new terminal, start the frontend application:
```bash
cd frontend
npm start
```

## Testing the Implementation

### Method 1: Using the Test Script

1. Run the automated test script:
```bash
cd frontend
npm run test:fsm
```

This will:
- Launch a browser
- Navigate to the test page
- Perform various interactions
- Verify state captures
- Test state comparisons
- Check visualization

### Method 2: Manual Testing

1. Open http://localhost:3000 in your browser
2. Navigate to the FSM Visualizer tab
3. In another tab, open http://localhost:3000/test-fsm.html
4. Perform the following test interactions:

#### Test Case 1: Form Interactions
1. Type in the username field
2. Type in the email field
3. Submit the form
4. Verify state changes in FSM Visualizer

#### Test Case 2: Dynamic Content
1. Click "Toggle Content" button
2. Click "Change Content" button
3. Click "Add Element" button
4. Verify state transitions in FSM Visualizer

#### Test Case 3: State Comparison
1. Select two different states in the timeline
2. Check the comparison view
3. Verify differences are highlighted

## Expected Results

### 1. State Capture
- New states should be captured after significant DOM changes
- Transient changes (like typing) should not create new states
- Each state should have:
  * Unique ID
  * Timestamp
  * DOM tree
  * Performance metrics

### 2. State Visualization
- Timeline should show state progression
- Current state should be highlighted
- State details should be visible on selection
- State transitions should be clear

### 3. State Comparison
- Differences between states should be highlighted
- Changes should be categorized by type:
  * DOM structure changes
  * Attribute changes
  * Event listener changes

## Troubleshooting

### Common Issues

1. **States not updating:**
   - Check browser console for errors
   - Verify backend server is running
   - Check network requests in DevTools

2. **Visualization not showing:**
   - Clear browser cache
   - Check React DevTools for component state
   - Verify API responses

3. **Test script failures:**
   - Ensure all dependencies are installed
   - Check port availability
   - Verify test page is accessible

### Debug Mode

Enable debug logging by setting DEBUG=true in the backend .env file:
```
DEBUG=true
PORT=3001
```

## Validation Checklist

- [ ] FSM Visualizer tab accessible
- [ ] Test page loads correctly
- [ ] State captures working
- [ ] Timeline visualization visible
- [ ] State comparison functional
- [ ] Performance metrics displayed
- [ ] No console errors
- [ ] All transitions smooth
- [ ] Memory usage stable

## Performance Metrics

Monitor these metrics during testing:

1. State Capture Time
   - Should be < 100ms per capture
   - Monitor in browser DevTools

2. Memory Usage
   - Check Chrome Task Manager
   - Monitor heap usage in DevTools

3. Visualization Performance
   - Timeline should remain responsive
   - Smooth transitions
   - No UI freezes

## Next Steps

After successful testing:

1. Document any issues found
2. Note performance bottlenecks
3. Plan optimizations if needed
4. Consider adding:
   - More test cases
   - Performance improvements
   - Additional visualizations
   - Export/import capabilities