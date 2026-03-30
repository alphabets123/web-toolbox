document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Fetch layout HTML
        const response = await fetch('/web/components/sidebar.html');
        if (!response.ok) throw new Error('Failed to load sidebar structure.');
        const html = await response.text();
        
        // 2. Inject into placeholders (we prepend to the body so it sits alongside the main content wrapper)
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        
        // Extract elements from the fetched HTML
        const customStyle = wrapper.querySelector('style');
        const overlay = wrapper.querySelector('#sidebarOverlay');
        const sidebar = wrapper.querySelector('#sidebar');
        
        // Inject elements into DOM
        if (customStyle) document.head.appendChild(customStyle);
        if (sidebar) document.body.insertBefore(sidebar, document.body.firstChild);
        if (overlay) document.body.insertBefore(overlay, document.body.firstChild);

        // Remove CSS skeleton loader placeholder
        document.body.classList.remove('sidebar-loading');

        // 3. Highlight active link based on current path
        let path = window.location.pathname;
        if (path === '' || path === '/' || path.endsWith('index.html')) {
            path = '/';
        }

        // Highlight Sidebar Links
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            let isMatch = false;
            
            if (path === '/' && (href === '/' || href.includes('index.html'))) {
                isMatch = true;
            } else if (path !== '/' && href !== '/' && path.includes(href.replace('.html', ''))) {
                isMatch = true;
            }
            
            if (isMatch) {
                // Active styles
                link.classList.add('bg-primary-fixed', 'text-primary', 'font-bold');
                link.classList.remove('text-on-surface-variant');
                // Apply fill icon style recursively if material symbol
                const icon = link.querySelector('.material-symbols-outlined');
                if (icon) icon.style.fontVariationSettings = "'FILL' 1";
            }
        });



        // 4. Sidebar toggle logic
        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle && sidebar && overlay) {
            function toggleSidebar() {
                if (window.innerWidth >= 1024) {
                    sidebar.classList.toggle('desktop-collapsed');
                } else {
                    sidebar.classList.toggle('sidebar-open');
                    overlay.classList.toggle('invisible');
                    if (sidebar.classList.contains('sidebar-open')) {
                        overlay.classList.remove('opacity-0');
                        overlay.classList.add('opacity-100');
                    } else {
                        overlay.classList.add('opacity-0');
                        overlay.classList.remove('opacity-100');
                    }
                }
            }
            menuToggle.addEventListener('click', toggleSidebar);
            overlay.addEventListener('click', toggleSidebar);
        }
    } catch (e) {
        console.error('Sidebar Injection Error: ', e);
    }
});
