(() => {
  const app = window.NCAGRC;
  const state = { slots: [], selected: null, clearing: null };
  const rows = document.getElementById('mappingRows');
  const search = document.getElementById('mappingSearch');
  const dialog = document.getElementById('mappingDialog');
  const form = document.getElementById('mappingForm');
  const clearDialog = document.getElementById('clearDialog');
  const clearForm = document.getElementById('clearForm');
  const sendDeferred = document.getElementById('sendDeferredOnboarding');
  const toast = document.getElementById('mappingToast');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));

  function notify(message, type = '') {
    toast.textContent = message;
    toast.className = `mapping-toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 6500);
  }

  async function request(path, options) {
    return app.apiRequest(path, options);
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const filtered = state.slots.filter(slot => [slot.division, slot.role, slot.role_email, slot.holder_name, slot.holder_email]
      .some(value => String(value || '').toLowerCase().includes(query)));
    const deferred = state.slots.filter(slot => slot.holder_user_id && slot.email_status === 'Deferred').length;
    document.getElementById('mappingSummary').textContent = `${filtered.length} of ${state.slots.length} permanent role accounts · ${deferred} deferred onboarding`;
    rows.innerHTML = filtered.map(slot => `<tr>
      <td>${esc(slot.division || 'All Divisions')}</td>
      <td><strong>${esc(slot.role_email)}</strong><br><small>${esc(slot.display_name)}</small></td>
      <td>${esc(slot.role)}</td>
      <td>${esc(slot.holder_name || 'Unassigned')}</td>
      <td>${esc(slot.holder_email || '—')}</td>
      <td>${slot.effective_from ? new Date(slot.effective_from).toLocaleDateString() : '—'}</td>
      <td><span class="state ${slot.identity_type === 'Role Placeholder' ? 'placeholder' : ''}">${esc(slot.holder_user_id ? (slot.email_status === 'Deferred' ? 'Onboarding deferred' : 'Named employee') : 'Unassigned')}</span></td>
      <td><div class="table-actions">
        <button class="primary" data-map="${slot.id}" data-assistant-purpose="Opens the personnel-assignment form for this permanent organisational role account." data-assistant-effect="Opening the form changes nothing. Submitting a replacement preserves assignment history, ends the former holder's access, revokes active sessions, transfers unfinished Action Centre work and maps the new named holder." data-assistant-requires="A System Administrator must provide the new holder's name, official NCA email, effective date and an assignment or replacement reason.">${slot.holder_user_id ? 'Replace' : 'Assign'}</button>
        ${slot.holder_user_id ? `<button class="danger" data-clear="${slot.id}" data-assistant-purpose="Opens the governed access-withdrawal form for the current role holder." data-assistant-effect="Opening the form changes nothing. Confirming it ends the current assignment, disables the holder's access and preserves the assignment history; it does not appoint a successor." data-assistant-requires="A System Administrator must provide an effective end date and clearance reason.">Clear</button>` : ''}
        <button data-history="${slot.id}" data-assistant-purpose="Opens the recorded holder-assignment history for this organisational role account." data-assistant-effect="This is a read-only view and does not change access or assignments." data-assistant-requires="No additional entry is required.">History</button>
      </div></td>
    </tr>`).join('') || '<tr><td colspan="8">No role accounts match this search.</td></tr>';
    if (sendDeferred) {
      sendDeferred.textContent = `Send Deferred Onboarding (${deferred})`;
      sendDeferred.disabled = deferred === 0;
    }
  }

  async function load() {
    const summary = document.getElementById('mappingSummary');
    summary.textContent = 'Loading organizational accounts...';
    rows.innerHTML = '<tr><td colspan="8">Loading account mappings...</td></tr>';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const data = await request('/users/role-slots', { signal: controller.signal });
      state.slots = Array.isArray(data.role_slots) ? data.role_slots : [];
      render();
    } catch (error) {
      const message = error.name === 'AbortError'
        ? 'Account mappings did not respond within 12 seconds.'
        : (error.message || 'Unable to load organizational account mappings.');
      summary.textContent = 'Account mappings could not be loaded.';
      rows.innerHTML = `<tr><td colspan="8"><strong>${esc(message)}</strong><br><button type="button" id="retryMappingLoad">Retry loading</button></td></tr>`;
      document.getElementById('retryMappingLoad')?.addEventListener('click', load, { once: true });
      notify(message, 'error');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function openMap(id) {
    state.selected = state.slots.find(slot => Number(slot.id) === Number(id));
    if (!state.selected) return;
    form.reset();
    form.elements.effective_from.value = new Date().toISOString().slice(0, 10);
    document.getElementById('mappingDialogTitle').textContent = `Map ${state.selected.display_name}`;
    document.getElementById('mappingRoleDetails').textContent = `${state.selected.role_email} · ${state.selected.division || 'All Divisions'}`;
    dialog.showModal();
  }

  function openClear(id) {
    state.clearing = state.slots.find(slot => Number(slot.id) === Number(id));
    if (!state.clearing?.holder_user_id) return;
    clearForm.reset();
    clearForm.elements.effective_to.value = new Date().toISOString().slice(0, 10);
    document.getElementById('clearDialogTitle').textContent = `Clear ${state.clearing.display_name}`;
    document.getElementById('clearRoleDetails').textContent = `${state.clearing.holder_name} · ${state.clearing.holder_email}`;
    clearDialog.showModal();
  }

  async function openHistory(id) {
    try {
      const data = await request(`/users/role-slots/${id}/history`);
      document.getElementById('historyTitle').textContent = `${data.slot.display_name} history`;
      document.getElementById('historyRows').innerHTML = (data.history || []).map(item => `<div class="history-item"><strong>${esc(item.employee_name)} · ${esc(item.employee_email)}</strong><small>${esc(item.status)} · ${new Date(item.effective_from).toLocaleDateString()}${item.effective_to ? ` to ${new Date(item.effective_to).toLocaleDateString()}` : ' to present'} · ${esc(item.metadata?.clearance_reason || item.replacement_reason || 'No reason recorded')}</small></div>`).join('') || '<p>No assignment history recorded.</p>';
      document.getElementById('historyDialog').showModal();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  rows.addEventListener('click', event => {
    const map = event.target.closest('[data-map]');
    const clear = event.target.closest('[data-clear]');
    const history = event.target.closest('[data-history]');
    if (map) openMap(map.dataset.map);
    if (clear) openClear(clear.dataset.clear);
    if (history) openHistory(history.dataset.history);
  });
  search.addEventListener('input', render);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.selected) return;
    const submit = document.getElementById('mappingSubmit');
    submit.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      body.defer_onboarding = form.elements.defer_onboarding.checked;
      const data = await request(`/users/role-slots/${state.selected.id}/map`, { method:'POST', body:JSON.stringify(body) });
      dialog.close();
      notify(data.message);
      await load();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  clearForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.clearing) return;
    const submit = document.getElementById('clearSubmit');
    submit.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(clearForm).entries());
      const data = await request(`/users/role-slots/${state.clearing.id}/clear`, { method:'POST', body:JSON.stringify(body) });
      clearDialog.close();
      notify(data.message);
      await load();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  sendDeferred?.addEventListener('click', async () => {
    const count = state.slots.filter(slot => slot.holder_user_id && slot.email_status === 'Deferred').length;
    if (!count || !window.confirm(`Generate fresh temporary passwords and send onboarding to ${count} deferred account holder(s)? Any active sessions for those deferred accounts will be revoked.`)) return;
    sendDeferred.disabled = true;
    try {
      const data = await request('/users/role-slots/onboarding/send-deferred', { method:'POST', body:'{}' });
      notify(data.message, data.summary?.failed ? 'error' : '');
      await load();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      render();
    }
  });

  document.getElementById('mappingClose').onclick = () => dialog.close();
  document.getElementById('mappingCancel').onclick = () => dialog.close();
  document.getElementById('clearClose').onclick = () => clearDialog.close();
  document.getElementById('clearCancel').onclick = () => clearDialog.close();
  document.getElementById('historyClose').onclick = () => document.getElementById('historyDialog').close();
  load();
})();
