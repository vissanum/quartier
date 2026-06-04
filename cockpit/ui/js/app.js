// Shell: hash routing between the three views.
//   #/pipeline   #/prospectos   #/proyecto/<id>

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  const tab = document.querySelector(`.tab[data-view="${name}"]`);
  if (tab) { tab.classList.add('active'); tab.hidden = false; }
}

async function route() {
  const hash = location.hash || '#/pipeline';
  const [, view, id] = hash.split('/');
  if (view === 'proyecto' && id) {
    showView('proyecto');
    document.getElementById('tab-proyecto').textContent = id;
    await loadProject(decodeURIComponent(id));
  } else if (view === 'prospectos') {
    showView('prospectos');
    document.getElementById('tab-proyecto').hidden = true;
    await loadProspects();
  } else {
    showView('pipeline');
    document.getElementById('tab-proyecto').hidden = true;
    await loadPipeline();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.view !== 'proyecto') location.hash = `#/${tab.dataset.view}`;
    });
  });
  window.addEventListener('hashchange', route);
  try {
    await loadPipeline(); // needed for FASES + summary before any view
  } catch (err) {
    toast(`Sin conexión con el servidor: ${err.message}`, 'err');
  }
  route();
});
