(() => {
    const app = window.NCAGRC;
    const user = app.getUser();
    const sidebar = document.querySelector(".sidebar");

    if (!sidebar || !user) return;

    sidebar.dataset.navigationReady = 'false';
    const navigationStyleLoads = [];
    function appendNavigationStylesheet(href,datasetKey) {
        const selector = `link[data-${datasetKey.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}]`;
        const existing = document.querySelector(selector);
        if (existing) return existing;
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = app.resolvePath(href);
        stylesheet.dataset[datasetKey] = 'true';
        navigationStyleLoads.push(new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            stylesheet.addEventListener('load',finish,{once:true});
            stylesheet.addEventListener('error',finish,{once:true});
            window.setTimeout(finish,1500);
        }));
        document.head.appendChild(stylesheet);
        return stylesheet;
    }

    if (!document.querySelector('link[data-sidebar-styles]')) {
        appendNavigationStylesheet('css/sidebar.css','sidebarStyles');
    }

    if (!document.querySelector('link[data-sidebar-shell-styles]')) {
        appendNavigationStylesheet('css/sidebar-shell.css?v=3','sidebarShellStyles');
    }

    const currentPage = app.getPageKey();
    const items = app.sidebars[user.role] || [];

    if (currentPage === 'executiveAnalytics' && !document.querySelector('link[data-executive-performance]')) {
        const performanceStyles = document.createElement('link');
        performanceStyles.rel = 'stylesheet';
        performanceStyles.href = app.resolvePath('css/executive-analytics-performance.css');
        performanceStyles.dataset.executivePerformance = 'true';
        document.head.appendChild(performanceStyles);
        window.addEventListener('DOMContentLoaded', () => {
            window.setTimeout(() => Promise.allSettled([
                typeof window.trends === 'function' ? window.trends() : null,
                typeof window.heatmap === 'function' ? window.heatmap() : null,
                typeof window.scorecard === 'function' ? window.scorecard() : null
            ]), 0);
        }, {once:true});
    }

    if (['communication','auditLogs','systemSettings','compliance','myApprovals','approvalDetails','executiveAnalytics','boardDashboard','actionCentre','actionHistory','workplans','reports'].includes(currentPage) && !document.querySelector('link[data-communication-sidebar-styles]')) {
        appendNavigationStylesheet('css/communication-sidebar.css','communicationSidebarStyles');
    }

    if (['auditLogs','systemSettings'].includes(currentPage) && !document.querySelector('link[data-admin-navigation-styles]')) {
        appendNavigationStylesheet('css/admin-navigation.css?v=1','adminNavigationStyles');
    }

    if (!document.querySelector('link[data-navigation-state-styles]')) {
        appendNavigationStylesheet('css/navigation-state.css?v=7','navigationStateStyles');
    }

    sidebar.innerHTML = `
        <header class="sidebar-header">
            <div class="logo">
                <span class="brand-mark">
                    <img class="brand-mark-image" src="${app.resolvePath("assets/images/NCA_-_Logo-04.png")}" alt="National Communications Authority logo">
                </span>
                <div>
                    <h2>NCA GRC</h2>
                    <span>30 Years | 1996 - 2026</span>
                </div>
            </div>
            <img class="anniversary-mark" src="${app.resolvePath("assets/images/IMG-20260305-WA0016-removebg-preview(2)(7).png")}" alt="NCA 30 years anniversary branding">
        </header>
        <nav class="sidebar-nav" aria-label="Primary navigation">
            <ul>
                ${items.map(([label, href, key]) => `
                    <li class="${key === currentPage ? "active" : ""}">
                        <a href="${app.resolvePath(href)}">${label}</a>
                    </li>
                `).join("")}
            </ul>
        </nav>
        <footer class="sidebar-footer">
            <button id="logoutBtn" class="logout-btn" type="button">Logout</button>
        </footer>
    `;

    const sidebarNavigation = sidebar.querySelector('.sidebar-nav');
    const sidebarScrollKey = `ncaGrc.sidebarScroll.${user.role}`;
    function saveSidebarScroll() {
        try {
            sessionStorage.setItem(sidebarScrollKey,String(sidebarNavigation.scrollTop));
        } catch (_) {}
    }
    function restoreSidebarScroll() {
        let savedPosition = 0;
        try {
            savedPosition = Math.max(0,Number(sessionStorage.getItem(sidebarScrollKey))||0);
        } catch (_) {}
        sidebarNavigation.scrollTop = savedPosition;
        const activeLink = sidebarNavigation.querySelector('li.active a');
        if (activeLink) {
            const navigationBounds = sidebarNavigation.getBoundingClientRect();
            const activeBounds = activeLink.getBoundingClientRect();
            const safeTop = navigationBounds.top + 10;
            const safeBottom = navigationBounds.bottom - 56;
            if (activeBounds.top < safeTop || activeBounds.bottom > safeBottom) {
                activeLink.scrollIntoView({block:'nearest'});
                const correctedBounds = activeLink.getBoundingClientRect();
                if (correctedBounds.bottom > safeBottom) {
                    sidebarNavigation.scrollTop += correctedBounds.bottom - safeBottom;
                } else if (correctedBounds.top < safeTop) {
                    sidebarNavigation.scrollTop -= safeTop - correctedBounds.top;
                }
            }
        }
    }
    sidebarNavigation.addEventListener('scroll',saveSidebarScroll,{passive:true});
    sidebarNavigation.addEventListener('click',event => {
        const link = event.target.closest('a');
        if (!link) return;
        saveSidebarScroll();
        document.documentElement.classList.add('nca-navigation-departing');
        sidebarNavigation.querySelector('li.active')?.classList.remove('active');
        link.closest('li')?.classList.add('active');
    });
    window.addEventListener('pagehide',saveSidebarScroll);
    Promise.all(navigationStyleLoads).finally(() => {
        window.requestAnimationFrame(() => {
            restoreSidebarScroll();
            sidebar.dataset.navigationReady = 'true';
            window.setTimeout(restoreSidebarScroll,60);
            window.setTimeout(restoreSidebarScroll,240);
            document.fonts?.ready.then(restoreSidebarScroll).catch(()=>{});
        });
    });
    window.addEventListener('load',restoreSidebarScroll,{once:true});

    if (currentPage === 'actionCentre') {
        const actionProfile = document.getElementById('userInfo');
        const actionHero = document.querySelector('.welcome');
        if (actionProfile && actionHero) {
            actionProfile.classList.add('nca-action-profile');
            actionHero.append(actionProfile);
        }
    } else {
        const main = document.querySelector('.main, .main-content');
        if (main && !main.querySelector('.nca-workspace-visual')) {
            const pageUserInfo = document.getElementById('userInfo');
            if (pageUserInfo) pageUserInfo.hidden = true;

            const visual = document.createElement('section');
            visual.className = 'nca-workspace-visual';
            visual.setAttribute('aria-label', 'NCA GRC signed-in workspace');
            visual.innerHTML = `
                <div class="nca-workspace-visual-copy">
                    <span class="nca-workspace-eyebrow">National Communications Authority</span>
                    <strong>Governance, risk and compliance</strong>
                    <span>Secure enterprise workspace</span>
                </div>
                <div id="ncaPageSession" class="nca-workspace-profile" aria-label="Current signed-in user"></div>
            `;
            main.prepend(visual);
            app.renderUserProfile(visual.querySelector('#ncaPageSession'), user);
        }
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sidebar-toggle';
    toggle.setAttribute('aria-label', 'Open navigation menu');
    toggle.setAttribute('aria-controls', 'ncaSidebar');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '☰';
    sidebar.id = 'ncaSidebar';

    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.append(toggle, overlay);

    function setDrawer(open) {
        sidebar.classList.toggle('is-open', open);
        overlay.classList.toggle('is-visible', open);
        document.body.classList.toggle('sidebar-drawer-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        toggle.textContent = open ? '×' : '☰';
    }

    toggle.addEventListener('click', () => setDrawer(!sidebar.classList.contains('is-open')));
    overlay.addEventListener('click', () => setDrawer(false));
    sidebar.querySelector('.sidebar-nav').addEventListener('click', event => {
        if (event.target.closest('a') && window.innerWidth < 992) setDrawer(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') setDrawer(false);
    });
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 992) setDrawer(false);
    });

    const logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => app.logout(app.resolvePath("index.html")));
    }

    const insightWidget = document.querySelector('[data-widget="ai-insights"]');
    if (insightWidget && document.getElementById('dateFrom')) {
        const escapeSummary = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
        async function loadAssessmentSummary() {
            const query = new URLSearchParams();
            ['dateFrom','dateTo','directorate','division','category','owner','status','level'].forEach(id => {
                const field = document.getElementById(id);
                if (field?.value) query.set(id,field.value);
            });
            try {
                const { summary } = await app.apiRequest(`/executive-analytics/assessment-summary?${query}`);
                insightWidget.querySelector('h2').textContent = 'Assessment Executive Summary';
                insightWidget.querySelector('header span').textContent = 'Transparent assessment governance';
                const keywords = (summary.top_keywords || []).map(item => `${escapeSummary(item.keyword)} (${item.count})`).join(', ') || 'No workbook keywords recorded';
                const responses = (summary.response_distribution || []).map(item => `${escapeSummary(item.response)} ${item.count}`).join(' · ') || 'No responses recorded';
                const body = insightWidget.querySelector('p') || insightWidget.appendChild(document.createElement('p'));
                body.innerHTML = `${escapeSummary(summary.narrative)}<br><br><strong>Average assessment:</strong> L${escapeSummary(summary.avg_likelihood || '—')} · I${escapeSummary(summary.avg_impact || '—')} · Score ${escapeSummary(summary.avg_score || '—')}<br><strong>Leading workbook keywords:</strong> ${keywords}<br><strong>Responses:</strong> ${responses}<br><strong>Governance trail:</strong> ${summary.focal_proposals} Focal proposals · ${summary.champion_reviews} Champion reviews · ${summary.final_approvals} final approvals.`;
            } catch (error) {
                console.error('Unable to load assessment executive summary.', error);
            }
        }
        loadAssessmentSummary();
        document.getElementById('apply')?.addEventListener('click',loadAssessmentSummary);
        document.getElementById('clear')?.addEventListener('click',()=>setTimeout(loadAssessmentSummary,0));
    }
})();
