/* ========================================
   whip_loadingscreen — the interaction icons

   A COPY of the icons on whip's 3D interaction prompts: the GLYPHS table in
   whip_core/html/js/glyphs.js, drawn the same way — 24x24, in currentColor.
   The logo's light shows a random one of these each time it lights a circle (js/logo.js).

   A COPY, NOT A LINK, because the loading screen is up before whip_core has even downloaded: it
   cannot borrow whip_core's files. Every action icon is here; `back` is left out (it is a menu
   arrow, not an action). To pick up an icon added to the badge later, copy its line from there.

   FULL_BLEED: the car slices, which fill the whole disc and are cut off by its edge (as on the
   badge) rather than sitting small in the middle.
   ======================================== */

(function () {
    'use strict';

    /** The parts every car-slice icon shares: a road, a wheel, and the arch over it. */
    function carGlyph(body, wx) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"'
             + ' stroke-linecap="round" stroke-linejoin="round">'
             + '<path d="M0 20.9H24" opacity="0.45"/>'
             + '<path d="M' + (wx - 3.8) + ' 17.6a3.9 3.9 0 0 1 7.6 0"/>'
             + '<circle cx="' + wx + '" cy="17.1" r="3.2"/>'
             + '<circle cx="' + wx + '" cy="17.1" r="1.15" fill="currentColor" stroke="none"/>'
             + body
             + '</svg>';
    }

    var GLYPHS = {
        lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<rect x="4.5" y="10.4" width="15" height="10.1" rx="2.2" fill="currentColor" stroke="none"/>'
            + '<path d="M8.2 10.4V7.4a3.8 3.8 0 0 1 7.6 0v3"/></svg>',

        unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<rect x="4.5" y="10.4" width="15" height="10.1" rx="2.2" fill="currentColor" stroke="none"/>'
            + '<path d="M8.2 10.4V7.4a3.8 3.8 0 0 1 7.3-1.3"/></svg>',

        lockpick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M7.5 13.87A5.6 5.6 0 1 1 14.4 11.12L10.44 7.16A1.75 1.75 0 0 0 7.96 9.64'
            +     'L11.92 13.6A5.6 5.6 0 0 1 11.3 13.87L13.1 20.8H5.7Z" fill="currentColor" stroke="none"/>'
            + '<path d="M22.4 22.2 18.8 18.6" stroke-width="4.4"/>'
            + '<path d="M18.8 18.6 9.7 8.9l.5-1.2" stroke-width="1.6"/></svg>',

        door: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"'
            + ' stroke-linejoin="round">'
            + '<path fill-rule="evenodd" d="M3.6 20.4V11.2L11.4 3.6h7.8a1.2 1.2 0 0 1 1.2 1.2v14.4'
            +     'a1.2 1.2 0 0 1-1.2 1.2ZM7 11.2h11V6.1h-5.6Zm7.2 2.4a.9.9 0 0 0 0 1.8h2.8a.9.9 0 0 0 0-1.8Z"/></svg>',

        hood_closed: carGlyph(
              '<path d="M1.8 17.6V13.2c0-1.1.9-1.5 1.9-1.65L13 10.2l6.6-5.7"/>'
            + '<path d="M1.8 17.6h3.4"/><path d="M12.8 17.6H23"/>', 9),

        hood_open: carGlyph(
              '<path d="M1.8 17.6V13.2c0-1.1.9-1.5 1.9-1.65l3.6-.5"/>'
            + '<path d="M13 10.2l6.6-5.7"/>'
            + '<path d="M13 10l-6.2-7.6"/>'
            + '<path d="M1.8 17.6h3.4"/><path d="M12.8 17.6H23"/>', 9),

        trunk_closed: carGlyph(
              '<path d="M22.2 17.6V13.2c0-1.1-.9-1.5-1.9-1.65L11 10.2 4.4 4.5"/>'
            + '<path d="M22.2 17.6h-3.4"/><path d="M11.2 17.6H1"/>', 15),

        trunk_open: carGlyph(
              '<path d="M22.2 17.6V13.2c0-1.1-.9-1.5-1.9-1.65l-3.6-.5"/>'
            + '<path d="M11 10.2L4.4 4.5"/>'
            + '<path d="M11 10l6.2-7.6"/>'
            + '<path d="M22.2 17.6h-3.4"/><path d="M11.2 17.6H1"/>', 15),

        trunk_lid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M3.6 14.2h16.8v4a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2Z"/>'
            + '<path d="M6.4 16.8h1.6"/><path d="M16 16.8h1.6"/>'
            + '<path d="M5.8 19.4v1.6"/><path d="M18.2 19.4v1.6"/>'
            + '<path d="M6 14.2 7.6 10.6h8.8l1.6 3.6"/>'
            + '<path d="M7.6 9.8h8.8l2.8-6.2H4.8Z" fill="currentColor" stroke-width="1.4"/></svg>',

        garage: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"'
            + ' stroke-linejoin="round">'
            + '<path d="M2.6 20V9.2L12 4.2l9.4 5V20h-3.6v-7.6H6.2V20Z"/>'
            + '<path d="M6.2 14.4h11.6v1.4H6.2Z" stroke="none"/>'
            + '<path d="M6.2 17.2h11.6v1.4H6.2Z" stroke="none"/></svg>',

        car: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"'
            + ' stroke-linejoin="round">'
            + '<path fill-rule="evenodd" d="M7.6 5.8A2 2 0 0 1 9.4 4.6h5.2a2 2 0 0 1 1.8 1.2L18 9.8h1.4'
            +     'A1.8 1.8 0 0 1 21.2 11.6v5a1.8 1.8 0 0 1-1.8 1.8H4.6A1.8 1.8 0 0 1 2.8 16.6v-5'
            +     'A1.8 1.8 0 0 1 4.6 9.8H6ZM8.6 9.8h6.8l-1-2.8H9.6ZM5.6 12.8a1.2 1.2 0 1 0 2.4 0'
            +     'a1.2 1.2 0 1 0-2.4 0ZM16 12.8a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Z"/>'
            + '<path d="M5 18.4h2.4v2.2H5Z"/><path d="M16.6 18.4H19v2.2h-2.4Z"/></svg>',

        store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M12 3.2v8.6"/><path d="M8.4 8.4 12 12l3.6-3.6"/>'
            + '<path d="M3.4 14.2v5.2a1 1 0 0 0 1 1h15.2a1 1 0 0 0 1-1v-5.2"/>'
            + '<path d="M3.4 14.2h17.2"/></svg>',

        turbo: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">'
            + '<path d="M22 13V15H18.32C18.75 14.09 19 13.08 19 12C19 8.14 15.86 5 12 5H2V3H12C16.97 3 21 7.03 21 12C21 12.34 20.97 12.67 20.94 13H22M12 19C8.14 19 5 15.86 5 12C5 10.93 5.25 9.91 5.69 9H2V11H3.06C3.03 11.33 3 11.66 3 12C3 16.97 7.03 21 12 21H22V19H12M16.86 12.2C15.93 12.94 14.72 12.47 14 12.05V12C16.79 10.31 15.39 7.89 15.39 7.89S14.33 6.04 14.61 7.89C14.78 9.07 13.76 9.88 13.04 10.3L13 10.28C12.93 7 10.13 7 10.13 7S8 7 9.74 7.69C10.85 8.13 11.04 9.42 11.05 10.25L11 10.28C8.14 8.7 6.74 11.12 6.74 11.12S5.67 12.97 7.14 11.8C8.07 11.07 9.28 11.54 10 11.95V12C7.21 13.7 8.61 16.12 8.61 16.12S9.67 17.97 9.4 16.11C9.22 14.94 10.25 14.13 10.97 13.7L11 13.73C11.07 17 13.87 17 13.87 17S16 17 14.26 16.31C13.15 15.87 12.96 14.58 12.95 13.75L13 13.73C15.86 15.31 17.26 12.88 17.26 12.88S18.33 11.04 16.86 12.2Z"/></svg>',

        furnish: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">'
            + '<path d="M1.8 8.2 3.6 3.4h3.6l1.8 4.8Z"/>'
            + '<rect x="4.6" y="8.2" width="1.6" height="11.2"/>'
            + '<rect x="2.8" y="19" width="5.2" height="1.6" rx=".8"/>'
            + '<rect x="12.2" y="7.4" width="6.6" height="5.8" rx="1.6"/>'
            + '<rect x="9.2" y="11.6" width="2.4" height="6.6" rx="1.2"/>'
            + '<rect x="19.4" y="11.6" width="2.4" height="6.6" rx="1.2"/>'
            + '<rect x="12.2" y="14.4" width="6.6" height="3.8" rx=".8"/>'
            + '<rect x="9.2" y="17" width="12.6" height="2.2" rx="1"/>'
            + '<rect x="10.2" y="18.8" width="1.6" height="1.8" rx=".5"/>'
            + '<rect x="19.2" y="18.8" width="1.6" height="1.8" rx=".5"/></svg>',

        theme: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">'
            + '<rect x="2.6" y="3" width="15.6" height="6.2" rx="1.6"/>'
            + '<rect x="18" y="5.3" width="3.4" height="1.6"/>'
            + '<rect x="19.8" y="5.3" width="1.6" height="7"/>'
            + '<rect x="11.2" y="10.7" width="10.2" height="1.6"/>'
            + '<rect x="11.2" y="10.7" width="1.6" height="4.2"/>'
            + '<rect x="10" y="14.2" width="4" height="7.4" rx="1.3"/></svg>',

        house: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"'
            + ' stroke-linejoin="round">'
            + '<path d="M3.4 10.6 12 4l8.6 6.6V20a1 1 0 0 1-1 1h-5.2v-5.2a1.2 1.2 0 0 0-1.2-1.2h-2.4'
            +     'a1.2 1.2 0 0 0-1.2 1.2V21H4.4a1 1 0 0 1-1-1Z"/></svg>',

        house_door: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"'
            + ' stroke-linejoin="round">'
            + '<path fill-rule="evenodd" d="M6.2 20.6V4.4a1.2 1.2 0 0 1 1.2-1.2h9.2a1.2 1.2 0 0 1 1.2 1.2v16.2Z'
            +     'M13.2 12.6a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0Z"/>'
            + '<path d="M3.6 20.2h16.8v1.6H3.6Z"/></svg>',

        pickup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M12 17.2V4.8"/>'
            + '<path d="M7.6 9.2 12 4.8l4.4 4.4"/>'
            + '<path d="M4.2 20.4h15.6"/></svg>',

        bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M2.8 9.4 12 4.2l9.2 5.2"/>'
            + '<path d="M6.2 11.6v6.2"/><path d="M12 11.6v6.2"/><path d="M17.8 11.6v6.2"/>'
            + '<path d="M3.6 20.2h16.8"/></svg>',

        deposit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<rect x="4.4" y="3.4" width="15.2" height="7.4" rx="1.2"/>'
            + '<circle cx="12" cy="7.1" r="1.7"/>'
            + '<path d="M12 13.4v4.8"/><path d="M9.2 15.6 12 18.4l2.8-2.8"/>'
            + '<path d="M4.4 20.8h15.2"/></svg>',

        withdraw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<rect x="4.4" y="3.4" width="15.2" height="7.4" rx="1.2"/>'
            + '<circle cx="12" cy="7.1" r="1.7"/>'
            + '<path d="M12 18.4v-4.8"/><path d="M9.2 16.2 12 13.4l2.8 2.8"/>'
            + '<path d="M4.4 20.8h15.2"/></svg>',

        fuel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path fill="currentColor" stroke-width="1" fill-rule="evenodd" d="M5.4 20.4V5'
            +     'a1.4 1.4 0 0 1 1.4-1.4h5.6A1.4 1.4 0 0 1 13.8 5v15.4ZM7.8 6.2h3.8a.6.6 0 0 1 .6.6v2.8'
            +     'a.6.6 0 0 1-.6.6H7.8a.6.6 0 0 1-.6-.6V6.8a.6.6 0 0 1 .6-.6Z"/>'
            + '<path d="M3.6 20.4h12"/>'
            + '<path d="M13.8 10.6h1.4a1.2 1.2 0 0 1 1.2 1.2v4.6a1.5 1.5 0 0 0 3 0V8.4L17 5.6"/></svg>',

        nozzle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M9.4 7.2 5 9.4"/>'
            + '<path d="M9.4 5.4h8a1.8 1.8 0 0 1 1.8 1.8v2.6h-7.6L9.4 9.2Z"/>'
            + '<path d="M12.2 9.8v3.4a1.6 1.6 0 0 0 1.6 1.6h3.8a1.6 1.6 0 0 0 1.6-1.6V9.8"/>'
            + '<path d="M19.2 7.8h.6a1.8 1.8 0 0 1 1.8 1.8v11"/>'
            + '<path d="M4.4 13.2c-1.1 1.5-1.6 2.5-1.6 3.2a1.6 1.6 0 0 0 3.2 0c0-.7-.5-1.7-1.6-3.2Z"'
            +     ' fill="currentColor" stroke-width="1.2"/></svg>',

        cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M6.4 5.4h13.4a1.4 1.4 0 0 1 1.4 1.4v8"/>'
            + '<rect x="2.8" y="8.6" width="15.4" height="10" rx="1.4"/>'
            + '<circle cx="10.5" cy="13.6" r="2.3"/></svg>',

        dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M17.2 7.5C16.6 5.9 14.6 4.8 12 4.8C8.9 4.8 6.8 6.1 6.8 8.1C6.8 10.1 8.9 10.9 12 11.6'
            +     'C15.1 12.3 17.2 13.1 17.2 15.4C17.2 17.6 15 19.2 12 19.2C9.2 19.2 7.3 18.1 6.7 16.4"/>'
            + '<path d="M12 2.4v2.4"/><path d="M12 19.2v2.4"/></svg>',

        talk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M7.6 6.2v-.6a2.2 2.2 0 0 1 2.2-2.2H19a2.2 2.2 0 0 1 2.2 2.2v8.8l-2.6-2.2"/>'
            + '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M5 8.4h9.2a2.2 2.2 0 0 1 2.2 2.2'
            +     'v4.8a2.2 2.2 0 0 1-2.2 2.2H6l-3.2 3.2V10.6A2.2 2.2 0 0 1 5 8.4Z'
            +     'M5.15 13a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0Z'
            +     'M8.35 13a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0Z'
            +     'M11.55 13a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0Z"/></svg>',

        phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<rect x="6.2" y="2.6" width="11.6" height="18.8" rx="2.6"/>'
            + '<path d="M10.2 18.2h3.6"/><path d="M10.6 5.6h2.8"/></svg>',

        bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M8.4 7.2V5.8a3.6 3.6 0 0 1 7.2 0v1.4"/>'
            + '<rect x="4.2" y="7.2" width="15.6" height="13.6" rx="3"/>'
            + '<path d="M4.2 12.8h15.6"/><path d="M10.2 12.8v2.4h3.6v-2.4"/></svg>',

        emote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<circle cx="12" cy="4.6" r="2.3" fill="currentColor" stroke="none"/>'
            + '<path d="M12 8.8v6"/><path d="M12 14.8 9 20.6"/><path d="M12 14.8l3 5.8"/>'
            + '<path d="M12 10.4 7.2 8.2"/><path d="M12 10.4l4.2-2.8 1.4-3.2"/></svg>',

        id: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<rect x="2.8" y="5.2" width="18.4" height="13.6" rx="2.2"/>'
            + '<circle cx="8.6" cy="10.8" r="2.1" fill="currentColor" stroke="none"/>'
            + '<path d="M5.6 15.8c.6-1.5 1.6-2.2 3-2.2s2.4.7 3 2.2"/>'
            + '<path d="M14.2 10h4.2"/><path d="M14.2 13.4h4.2"/></svg>',

        power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M12 3.2v8.2"/><path d="M7.2 6.4a7.6 7.6 0 1 0 9.6 0"/></svg>',

        headlights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M11.6 5.4H10.2C6.3 5.4 3.4 8.3 3.4 12s2.9 6.6 6.8 6.6h1.4Z" fill="currentColor" stroke-width="1.2"/>'
            + '<path d="M15.2 6.4l5.6 1.4"/><path d="M15.2 9.9l5.6 1.4"/>'
            + '<path d="M15.2 13.4l5.6 1.4"/><path d="M15.2 16.9l5.6 1.4"/></svg>',

        seat: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<rect x="7.6" y="2.4" width="4.8" height="3.4" rx="1.5"/>'
            + '<path d="M8.4 7.2h3.6c.6 0 1 .5.9 1.1L11.7 15H7.1l.4-6.9c0-.5.4-.9.9-.9Z"/>'
            + '<rect x="7" y="15.9" width="11" height="3.4" rx="1.6"/>'
            + '<path d="M9.2 21.4h7.4" fill="none" stroke-width="2"/></svg>',

        devtools: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M20.14 5.99A4.6 4.6 0 1 1 18.01 3.86L14.52 7.36L16.64 9.49Z"/>'
            + '<path d="M14.2 9.8 4.9 19.1" fill="none" stroke-width="3.6"/></svg>',

        place: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M12 4.6v11.8"/><path d="M7.6 12 12 16.4l4.4-4.4"/><path d="M4.2 20.4h15.6"/></svg>',

        give: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<circle cx="17.2" cy="6.6" r="2.4" fill="currentColor" stroke="none"/>'
            + '<path d="M13.2 20.4v-1.8a4 4 0 0 1 8 0v1.8"/>'
            + '<path d="M2.8 13.2h7.6"/><path d="M7.4 10l3.2 3.2-3.2 3.2"/></svg>',

        eat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M6.4 3.2v5.4a2.6 2.6 0 0 0 5.2 0V3.2"/><path d="M9 3.2v5.2"/><path d="M9 11.2v9.6"/>'
            + '<path d="M17.6 20.8V3.2c-2 .9-3.2 3.4-3.2 6.8v3.2h3.2"/></svg>',

        respawn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
            + ' stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M19.6 12.4a7.6 7.6 0 1 1-2.4-5.8"/><path d="M19.8 3.6v4.6h-4.6"/></svg>',
    };

    var FULL_BLEED = { hood_closed: true, hood_open: true, trunk_closed: true, trunk_open: true };

    window.WhipIcons = { glyphs: GLYPHS, fullBleed: FULL_BLEED };
})();
