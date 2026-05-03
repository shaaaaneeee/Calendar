/**
 * Jest environment shim.
 *
 * The detection files assign to window.* for browser compatibility.
 * In Node/Jest there is no window, so we create one that points to global.
 * This means window.X and global.X are the same object.
 */
global.window = global;
