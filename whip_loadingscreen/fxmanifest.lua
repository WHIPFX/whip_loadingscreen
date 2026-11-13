fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'whip_loadingscreen'
author 'Whippy'
description 'Loading screen — the whip logo over a drifting blueprint, its I the loading light.'
version '1.6.2'

-- `loadscreen`, not `ui_page`. The game shows this page from the moment the player connects until
-- something calls ShutdownLoadingScreen.
loadscreen 'html/index.html'

-- NO `loadscreen_manual_shutdown`. That key hands responsibility for dismissing the screen to this
-- resource, and nothing here is in a position to know when the world is ready. whip_core's own
-- spawn flow calls ShutdownLoadingScreen once the player is in the world (client/spawn.lua) —
-- spawnmanager is not used — so the default is both correct and already wired.

-- This resource has NO Lua at all. A loading screen is pure NUI, and this one needs nothing from the
-- game: the logo's light and the blueprint run on their own until the screen is taken away.

-- THE BLUEPRINT IS DRAWN WITH THREE.JS (html/bp), and that is the only version. If a player's game
-- cannot run it (no WebGL 2), the screen is black under the logo.
--
-- TO CHANGE IT, change dev/blueprint.js and run `node dev/blueprint.js` (Node, and Chrome on this
-- machine). It writes the blueprint as a web page into dev/sheet, then photographs every piece of that
-- page and reads its animations (dev/bp/export.js) into html/bp/scene.json and html/bp/atlas-*.webp,
-- which html/bp/bp.js plays on one canvas. The sheet's speed and blur are in dev/sheet/sheet.css.
-- `node dev/bp/compare.js <folder>` puts the sheet and the screen side by side. Nothing in dev/ is
-- sent to players: the sheet itself would take hundreds of MB to show.
--
-- TO LOOK AT THIS SCREEN IN A BROWSER, run `node dev/bp/serve.js` and open the address it prints
-- (preview.html: the screen, and buttons to try out logo variants from html/css/variants.css). Opened
-- by double-clicking, it shows only the logo: browsers don't run the screen's module from disk.
-- preview.html and variants.css are left out of `files`, so players never get them.
files {
    'html/index.html',
    'html/css/loading.css',
    'html/js/icons.js',
    'html/js/logo.js',
    'html/bp/start.js',
    'html/bp/bp.js',
    'html/bp/anim.js',
    'html/bp/bp.css',
    'html/bp/scene.json',
    'html/bp/atlas-*.webp',
    'html/bp/vendor/three.module.min.js',
}
