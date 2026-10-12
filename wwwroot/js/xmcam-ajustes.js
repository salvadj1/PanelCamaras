/* Ajustes de la web: tema, calidad por defecto del directo y pantalla encendida. */
(function(){
  const { $, store, THEMES, applyTheme, esc } = XM;
  function drawThemes(){
    const sel = store.get('theme', 'NVR_DARK');
    $('temas').innerHTML = THEMES.map(t => `
      <button class="themecard ${t.id === sel ? 'sel' : ''}" data-id="${t.id}" type="button">
        <span class="swatch" style="background:${t.c}"></span>
        <span><b>${esc(t.label)}</b><br><span class="mut small">${esc(t.desc)}</span></span>
      </button>`).join('');
    $('temas').querySelectorAll('.themecard').forEach(b => b.onclick = () => { store.set('theme', b.dataset.id); applyTheme(); drawThemes(); });
  }
  $('sFollow').checked = store.get('follow', 'true') === 'true';
  $('sFollow').onchange = e => { store.set('follow', e.target.checked); applyTheme(); };
  function drawStream(){
    const s = store.get('stream', '1');
    $('sHd').classList.toggle('sel', s === '0'); $('sSd').classList.toggle('sel', s === '1');
  }
  $('sHd').onclick = () => { store.set('stream', 0); drawStream(); };
  $('sSd').onclick = () => { store.set('stream', 1); drawStream(); };
  $('sKeep').checked = store.get('keepOn', 'true') === 'true';
  $('sKeep').onchange = e => store.set('keepOn', e.target.checked);
  drawThemes(); drawStream();
})();
