const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('administrator dashboard quick actions open real governed pages', () => {
    const dashboard = read('frontend/js/dashboard.js');
    assert.match(dashboard, /\['Audit Logs','pages\/audit-logs\.html'\]/);
    assert.match(dashboard, /\['System Settings','pages\/system-settings\.html'\]/);
    assert.doesNotMatch(dashboard, /\['Audit Logs','#'\]|\['System Settings','#'\]/);
});

test('audit and settings pages are administrator-only navigation targets', () => {
    const app = read('frontend/js/app.js');
    const sidebar = read('frontend/js/sidebar.js');
    const navigation = read('frontend/css/admin-navigation.css');
    assert.match(app, /auditLogs:\s*\[roles\.ADMIN\]/);
    assert.match(app, /systemSettings:\s*\[roles\.ADMIN\]/);
    assert.match(app, /audit-logs\.html"\) return "auditLogs"/);
    assert.match(app, /system-settings\.html"\) return "systemSettings"/);
    assert.match(sidebar, /\['auditLogs','systemSettings'\]/);
    assert.match(sidebar, /admin-navigation\.css/);
    assert.match(navigation, /body \.sidebar \.sidebar-nav a\s*\{[^}]*color:\s*rgba\(255,\s*255,\s*255,\s*\.92\)/s);
    assert.match(navigation, /:focus-visible/);
});

test('audit logs page supports inspection, filtering and export', () => {
    const page = read('frontend/pages/audit-logs.html');
    const script = read('frontend/js/audit-logs.js');
    assert.match(page, />Close</);
    assert.match(page, /Export CSV/);
    assert.match(page, /id="closeDetail"/);
    assert.match(script, /apiRequest\('\/audit-logs'\)/);
    assert.match(script, /text\/csv/);
    assert.match(script, /showModal\(\)/);
});

test('system settings overview is administrator-only and excludes secrets', () => {
    const route = read('backend/routes/systemSettingsRoutes.js');
    const controller = read('backend/controllers/systemSettingsController.js');
    const page = read('frontend/pages/system-settings.html');
    assert.match(route, /role\('System Administrator'\)/);
    assert.match(route, /controller\.overview/);
    assert.match(controller, /PASSWORD_POLICY/);
    assert.match(controller, /connection_status/);
    assert.doesNotMatch(controller, /encrypted_password|password_hash|JWT_SECRET|DB_PASSWORD/i);
    assert.match(page, />Close</);
    assert.match(page, /Security Policy/);
    assert.match(page, /Communication and SMTP settings/);
});

test('dashboard notification popup has governed close interactions', () => {
    const dashboard = read('frontend/js/dashboard.js');
    const page = read('frontend/nca-grc-risk-register.html');
    assert.match(dashboard, /aria-label','Close notifications'/);
    assert.match(dashboard, /notificationClose\.addEventListener\('click'/);
    assert.match(dashboard, /event\.key==='Escape'/);
    assert.match(dashboard, /notificationDropdown\.contains\(event\.target\)/);
    assert.match(dashboard, /aria-expanded/);
    assert.match(page, /dashboard\.js\?v=5/);
});

test('all role navigation uses one governed active, hover and focus state', () => {
    const sidebar = read('frontend/js/sidebar.js');
    const styles = read('frontend/css/navigation-state.css');
    assert.match(sidebar, /navigation-state\.css\?v=7/);
    assert.match(styles, /\.sidebar-nav a\s*\{[^}]*border-left:\s*0\s*!important/s);
    assert.match(styles, /li\.active a::before\s*\{[^}]*background:\s*#ffc72c/s);
    assert.doesNotMatch(styles, /border-left-color:\s*transparent/);
    assert.match(styles, /a:focus-visible/);

    const htmlFiles = [];
    const visit = directory => {
        for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(target);
            else if (entry.name.endsWith('.html')) htmlFiles.push(target);
        }
    };
    visit(path.join(root, 'frontend'));
    const pagesUsingSidebar = htmlFiles
        .map(file => fs.readFileSync(file, 'utf8'))
        .filter(content => content.includes('sidebar.js'));
    assert.ok(pagesUsingSidebar.length > 0);
    for (const content of pagesUsingSidebar) {
        assert.match(content, /sidebar\.js\?v=20260725-10/);
        assert.match(content, /sidebar\.css\?v=20260725-1" data-sidebar-styles="true"/);
        assert.match(content, /communication-sidebar\.css\?v=20260725-1" data-communication-sidebar-styles="true"/);
        assert.match(content, /sidebar-shell\.css\?v=3" data-sidebar-shell-styles="true"/);
        assert.match(content, /navigation-state\.css\?v=7" data-navigation-state-styles="true"/);
    }
});

test('sidebar preserves navigation position and avoids an unstyled flash', () => {
    const sidebar = read('frontend/js/sidebar.js');
    assert.match(sidebar, /sessionStorage\.setItem\(sidebarScrollKey/);
    assert.match(sidebar, /sessionStorage\.getItem\(sidebarScrollKey/);
    assert.match(sidebar, /window\.addEventListener\('pagehide',saveSidebarScroll\)/);
    assert.match(sidebar, /activeLink\.scrollIntoView\(\{block:'nearest'\}\)/);
    assert.doesNotMatch(sidebar, /sidebar\.style\.visibility = 'hidden'/);
    assert.doesNotMatch(sidebar, /sidebar\.style\.visibility = 'visible'/);
    assert.match(sidebar, /sidebar-shell\.css\?v=3/);
    assert.match(sidebar, /navigationReady = 'true'/);
});

test('cross-page navigation avoids distorted browser snapshots', () => {
    const sidebar = read('frontend/js/sidebar.js');
    const styles = read('frontend/css/navigation-state.css');
    assert.match(sidebar, /classList\.add\('nca-navigation-departing'\)/);
    assert.match(sidebar, /querySelector\('li\.active'\)\?\.classList\.remove\('active'\)/);
    assert.match(sidebar, /link\.closest\('li'\)\?\.classList\.add\('active'\)/);
    assert.doesNotMatch(styles, /@view-transition|view-transition-name|::view-transition/);
    assert.match(styles, /nca-navigation-departing[^}]*transition:\s*none/s);
});

test('compliance page preloads the complete navy sidebar shell', () => {
    const page = read('frontend/pages/compliance.html');
    const shell = read('frontend/css/sidebar-shell.css');
    assert.match(page, /sidebar-shell\.css\?v=3" data-sidebar-shell-styles="true"/);
    assert.match(page, /navigation-state\.css\?v=7" data-navigation-state-styles="true"/);
    assert.match(shell, /body \.sidebar\s*\{[^}]*background:\s*linear-gradient/s);
    assert.match(shell, /body \.sidebar \.sidebar-header,\s*body \.sidebar \.sidebar-nav,\s*body \.sidebar \.sidebar-footer\s*\{[^}]*visibility:\s*visible/s);
});

test('logout and navigation links share governed typography', () => {
    const navigation = read('frontend/css/navigation-state.css');
    const shell = read('frontend/css/sidebar-shell.css');
    assert.match(navigation, /\.sidebar-nav a\s*\{[^}]*font-family:\s*inherit[^}]*font-size:\s*14px\s*!important[^}]*font-weight:\s*600[^}]*line-height:\s*1\.35/s);
    assert.match(shell, /\.logout-btn\s*\{[^}]*min-height:\s*45px[^}]*padding:\s*13px 14px\s*!important[^}]*font-family:\s*inherit\s*!important[^}]*font-size:\s*14px\s*!important[^}]*font-weight:\s*600\s*!important[^}]*line-height:\s*1\.35/s);
});

test('the final Reports item remains clear of the Logout footer', () => {
    const navigation = read('frontend/css/navigation-state.css');
    const sidebar = read('frontend/js/sidebar.js');
    assert.match(navigation, /\.sidebar-nav\s*\{[^}]*padding-bottom:\s*48px[^}]*scroll-padding-bottom:\s*56px/s);
    assert.match(navigation, /\.sidebar-nav li\.active\s*\{[^}]*scroll-margin-bottom:\s*56px/s);
    assert.match(sidebar, /const safeBottom = navigationBounds\.bottom - 56/);
    assert.match(sidebar, /sidebarNavigation\.scrollTop \+= correctedBounds\.bottom - safeBottom/);
    assert.match(sidebar, /window\.setTimeout\(restoreSidebarScroll,240\)/);
    assert.match(sidebar, /document\.fonts\?\.ready\.then\(restoreSidebarScroll\)/);
    assert.match(sidebar, /window\.addEventListener\('load',restoreSidebarScroll/);
});
