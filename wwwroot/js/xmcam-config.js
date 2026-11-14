/** Página /camara/{id}/config: monta el editor de bloque (xmcam-cfgpanel.js) con los parámetros de la URL. */
(function(){
  const host = XM.$('cfg'), qs = new URLSearchParams(location.search);
  XmConfig.mount(host, { id: host.dataset.cam, name: qs.get('name') || '', filter: qs.get('filter') });
})();
