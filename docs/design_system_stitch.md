# Stitch UI Design System Guidelines

This document outlines the visual identity and structural components for the **Stitch UI** theme used in the SnapTask project. Use these guidelines to maintain consistency or replicate the same look and feel in new projects.

---

## 🎨 1. Core Visual Attributes
- **Premium & Vibrant**: Uses modern, saturated colors with smooth transitions.
- **Glassmorphism**: Leverages background blur, subtle borders, and layered transparency.
- **Dynamic Depth**: Employs animated background blobs to create a layered "living" interface.

## 🌈 2. Color Palette (CSS Variables)

Define these core variables in your `:root`:

```css
:root {
    --bg-color: #f8fafc;           /* Light gray-blue background */
    --sidebar-bg: #ffffff;         /* Clean white sidebar */
    --accent-color: #6366f1;       /* Indigo (Stitch Primary) */
    --secondary-color: #a855f7;    /* Purple (Stitch Secondary) */
    --tertiary-color: #4f46e5;     /* Deep Indigo (Focus/Hover) */
    --text-color: #0f172a;         /* Dark Navy text */
    --text-muted: #64748b;         /* Slate gray for secondary info */
    --glass-bg: rgba(255, 255, 255, 0.9);
    --glass-border: rgba(0, 0, 0, 0.08); /* Subtle 8% black border */
}
```

## 🔡 3. Typography (Google Fonts)

Add the following import and font-family rules:

```html
<!-- Google Fonts Import -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&family=Outfit:wght@500;800&display=swap" rel="stylesheet">
```

- **Body Text**: `font-family: 'Inter', sans-serif;`
- **Headlines (H1-H6)**: `font-family: 'Plus Jakarta Sans', sans-serif;`
- **Special UI / Modals**: `font-family: 'Outfit', sans-serif;`

## ✨ 4. Key UI Patterns

### Glass Container
Use this for main content cards or wrappers:
```css
.container {
    background: var(--glass-bg);
    backdrop-filter: blur(20px);
    border: 1px solid var(--glass-border);
    border-radius: 1.5rem;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.05);
}
```

### Vibrant Buttons
Primary buttons should feel interactive and "pop":
```css
.btn-primary {
    background: linear-gradient(135deg, var(--accent-color), var(--secondary-color));
    color: white;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
    transition: transform 0.2s, box-shadow 0.2s;
}
.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 15px rgba(99, 102, 241, 0.4);
}
```

### Background Animation (Blobs)
Add these elements behind everything for a modern depth effect:
```css
.bg-blob {
    position: absolute;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, var(--accent-color) 0%, transparent 60%);
    filter: blur(100px);
    opacity: 0.1;
    z-index: -1;
    animation: move 25s infinite alternate;
}

@keyframes move {
    0% { transform: translate(0, 0) scale(1); }
    100% { transform: translate(150px, 150px) scale(1.1); }
}
```

## 📱 5. Responsive Layout Logic
- **Sidebar Width**: 288px (Fixed on desktop, collapsible).
- **Sticky Top Bar**: Height ~3.5rem, features a gradient background.
- **Mobile First**: Condense padding (2.5rem → 1rem) and font sizes for smaller screens.

---

> [!TIP]
> To apply this in a new project, simply provide this file as context to Antigravity and ask it to "Implement the Stitch UI theme using the variables and patterns defined in this guide."
