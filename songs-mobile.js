(() => {
  const page = document.querySelector('.page[data-page="songs"]');
  if (!page) return;
  const overview = page.querySelector('.songs-overview');
  const workbench = page.querySelector('.songs-workbench');
  const playlists = page.querySelector('.songs-playlists');
  if (!overview || !workbench || !playlists) return;

  const tabs = document.createElement('div');
  tabs.className = 'songs-mobile-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '歌曲頁面切換');
  tabs.innerHTML = `
    <button type="button" class="songs-mobile-tab is-active" role="tab" aria-selected="true" data-song-panel="library">歌曲庫</button>
    <button type="button" class="songs-mobile-tab" role="tab" aria-selected="false" data-song-panel="playlists">我的歌單 <span id="mobilePlaylistCount">0</span></button>
  `;
  overview.before(tabs);

  const songList = page.querySelector('#songList');
  const songEmpty = page.querySelector('#songEmpty');
  const playlistList = page.querySelector('#songPlaylistList');
  const songScroll = document.createElement('div');
  songScroll.className = 'songs-inner-scroll songs-list-scroll';
  songList.before(songScroll);
  songScroll.append(songList);
  if (songEmpty) songScroll.append(songEmpty);
  const playlistScroll = document.createElement('div');
  playlistScroll.className = 'songs-inner-scroll playlists-list-scroll';
  playlistList.before(playlistScroll);
  playlistScroll.append(playlistList);

  function setPanel(panel) {
    const showPlaylists = panel === 'playlists';
    overview.hidden = showPlaylists;
    workbench.hidden = showPlaylists;
    playlists.hidden = !showPlaylists;
    tabs.querySelectorAll('[data-song-panel]').forEach((button) => {
      const active = button.dataset.songPanel === panel;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    try { sessionStorage.setItem('pjskSongsMobilePanel', panel); } catch {}
  }

  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-song-panel]');
    if (button) setPanel(button.dataset.songPanel);
  });

  const updateCount = () => {
    const source = document.getElementById('songPlaylistTotal');
    const target = document.getElementById('mobilePlaylistCount');
    if (source && target) target.textContent = source.textContent;
  };
  new MutationObserver(updateCount).observe(document.getElementById('songPlaylistTotal'), { childList: true, characterData: true, subtree: true });
  updateCount();

  let initial = 'library';
  try {
    if (sessionStorage.getItem('pjskSongsMobilePanel') === 'playlists') initial = 'playlists';
  } catch {}
  setPanel(initial);
})();