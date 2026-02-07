# Contributing to AIO Agency

Thank you for your interest in contributing to AIO Agency!

## Guidelines

### Before Making Changes
1. All modules except Calendar are currently **FROZEN** - do not modify without approval
2. Calendar module is open for development and enhancements
3. Create a branch for any new feature or fix

### Code Style
- Use consistent formatting (Prettier recommended)
- Follow existing naming conventions
- Add comments for complex logic
- Use CSS variables for colors (see `src/index.css`)

### Theme Compliance
All UI changes must support both light and dark modes using CSS variables defined in `src/index.css`

### Button Colors
- **Standard Actions**: Purple (bg-purple-600)
- **Destructive Actions**: Red (bg-red-600) - for delete, logout only
- **Hover States**: Use darker shade of same color

### Testing
- Test changes in both light and dark modes
- Verify responsive design on mobile
- Check for console errors

### Pull Requests
1. Describe changes clearly
2. Reference any related issues
3. Indicate which module(s) were modified
4. Note if any dependencies were added

### Reporting Issues
Include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots if applicable
- Browser and OS information

## Module-Specific Notes

### Calendar (Open for Development)
- Implement functional booking system
- Add Google Calendar integration
- Ensure theme compliance

### All Other Modules
- Currently frozen
- Contact maintainers before making changes

## Questions?
Create an issue or contact the development team.
