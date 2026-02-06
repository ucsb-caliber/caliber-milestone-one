# shadcn Components

This project uses [shadcn/ui](https://ui.shadcn.com/) - a collection of pre-built, well designed, accessible, and customizable React components built with Radix UI and Tailwind CSS.

## Finding Components

Browse the full component library at: **https://ui.shadcn.com/docs/components**

You can search for components like buttons, forms, dialogs, dropdowns, and more. Each component page includes:
- Live interactive demos
- Code examples
- API documentation
- Accessibility features

## Installing Components

shadcn/ui components are not installed as a dependency. Instead, they're copied directly into your project, giving you full ownership and control.

To add a component, run:

```bash
npx shadcn@latest add [component-name]
```

**Examples:**
```bash
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add select
```

Components will be installed in the `src/components/ui/` directory.

## Customizing Components

Since components are copied directly into your project, you have complete freedom to modify them:

1. **Direct File Editing**: Components are located in `src/components/ui/` - simply open and edit the JSX files
2. **Styling**: Modify Tailwind classes directly in the component files
3. **Functionality**: Add or remove props, change behavior, or extend features
4. **No Breaking Changes**: Customizations won't be overwritten by updates since these aren't npm packages

**Example:** To change button styles, edit `src/components/ui/button.jsx` and modify the className variants.

## Useful Resources

- **Main Documentation**: https://ui.shadcn.com/docs
- **Installation Guide**: https://ui.shadcn.com/docs/installation
- **Components List**: https://ui.shadcn.com/docs/components
- **Theming Guide**: https://ui.shadcn.com/docs/theming
- **CLI Reference**: https://ui.shadcn.com/docs/cli
- **Examples & Templates**: https://ui.shadcn.com/examples

## Project Setup

This project is already configured with:
- Tailwind CSS
- shadcn/ui CLI
- Component aliases (`@/components/ui/*`)

You can start adding components right away!
