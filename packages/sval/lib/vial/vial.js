/* global KBAPI, KEY */

// vial.js
//
////////////////////////////////////
//
//  Pull together all Vial's .js files.
//
////////////////////////////////////
import { BE16, BE32, LE16, LE32, MSG_LEN, USB } from "../usbhid.js";
import { decompress, lockValue } from "../util.js";
import { kb as keyboard } from "./kb.js";

export const kb = keyboard;

export const VialUSB = lockValue({
  // Raw Via+Vial commands.
  CMD_VIA_GET_PROTOCOL_VERSION: 0x01,
  CMD_VIA_GET_KEYBOARD_VALUE: 0x02,
  CMD_VIA_SET_KEYBOARD_VALUE: 0x03,
  CMD_VIA_GET_KEYCODE: 0x04,
  CMD_VIA_SET_KEYCODE: 0x05,
  CMD_VIA_LIGHTING_SET_VALUE: 0x07,
  CMD_VIA_LIGHTING_GET_VALUE: 0x08,
  CMD_VIA_LIGHTING_SAVE: 0x09,
  CMD_VIA_MACRO_GET_COUNT: 0x0c,
  CMD_VIA_MACRO_GET_BUFFER_SIZE: 0x0d,
  CMD_VIA_MACRO_GET_BUFFER: 0x0e,
  CMD_VIA_MACRO_SET_BUFFER: 0x0f,
  CMD_VIA_GET_LAYER_COUNT: 0x11,
  CMD_VIA_KEYMAP_GET_BUFFER: 0x12,
  CMD_VIA_VIAL_PREFIX: 0xfe,

  VIA_LAYOUT_OPTIONS: 0x02,
  VIA_SWITCH_MATRIX_STATE: 0x03,

  QMK_BACKLIGHT_BRIGHTNESS: 0x09,
  QMK_BACKLIGHT_EFFECT: 0x0a,
  QMK_RGBLIGHT_BRIGHTNESS: 0x80,
  QMK_RGBLIGHT_EFFECT: 0x81,
  QMK_RGBLIGHT_EFFECT_SPEED: 0x82,
  QMK_RGBLIGHT_COLOR: 0x83,

  VIALRGB_GET_INFO: 0x40,
  VIALRGB_GET_MODE: 0x41,
  VIALRGB_GET_SUPPORTED: 0x42,
  VIALRGB_SET_MODE: 0x41,

  CMD_VIAL_GET_KEYBOARD_ID: 0x00,
  CMD_VIAL_GET_SIZE: 0x01,
  CMD_VIAL_GET_DEFINITION: 0x02,
  CMD_VIAL_GET_ENCODER: 0x03,
  CMD_VIAL_SET_ENCODER: 0x04,
  CMD_VIAL_GET_UNLOCK_STATUS: 0x05,
  CMD_VIAL_UNLOCK_START: 0x06,
  CMD_VIAL_UNLOCK_POLL: 0x07,
  CMD_VIAL_LOCK: 0x08,
  CMD_VIAL_QMK_SETTINGS_QUERY: 0x09,
  CMD_VIAL_QMK_SETTINGS_GET: 0x0a,
  CMD_VIAL_QMK_SETTINGS_SET: 0x0b,
  CMD_VIAL_QMK_SETTINGS_RESET: 0x0c,
  CMD_VIAL_DYNAMIC_ENTRY_OP: 0x0d,

  DYNAMIC_VIAL_GET_NUMBER_OF_ENTRIES: 0x00,
  DYNAMIC_VIAL_TAP_DANCE_GET: 0x01,
  DYNAMIC_VIAL_TAP_DANCE_SET: 0x02,
  DYNAMIC_VIAL_COMBO_GET: 0x03,
  DYNAMIC_VIAL_COMBO_SET: 0x04,
  DYNAMIC_VIAL_KEY_OVERRIDE_GET: 0x05,
  DYNAMIC_VIAL_KEY_OVERRIDE_SET: 0x06,

  send: (...args) => {
    return USB.send(...args);
  },

  sendVial: (cmd, args, flags) => {
    const vargs = [cmd, ...args];
    return VialUSB.send(VialUSB.CMD_VIA_VIAL_PREFIX, vargs, flags);
  },

  getViaBuffer: async (cmd, size, opts, check) => {
    // Fetch a buffer, 28 bytes at a time.
    // This is for Via messages that expect:
    //   send(cmd_get_buffer, [offset, size])
    let offset = 0;
    const chunksize = 28;
    const alldata = [];
    if (!opts.bytes) opts.bytes = 1;

    while (offset < size) {
      let sz = chunksize;
      if (sz > size - offset) {
        sz = size - offset;
      }

      let data = await VialUSB.send(cmd, [...BE16(offset), sz], opts);
      if (sz < chunksize) {
        data = data.slice(0, parseInt(sz / opts.bytes));
      }

      alldata.push(...data);

      if (check && check(alldata)) {
        break;
      }

      offset += chunksize;
    }

    return alldata;
  },

  pushViaBuffer: async (cmd, size, buffer) => {
    // Push a buffer, 28 bytes at a time.
    // This is for Via messages that expect:
    //   send(cmd_get_buffer, [offset, size])
    let offset = 0;
    const chunksize = 28;
    const alldata = [];

    while (offset < size) {
      let sz = chunksize;
      if (sz > size - offset) {
        sz = size - offset;
      }

      await VialUSB.send(cmd, [
        ...BE16(offset),
        sz,
        ...new Uint8Array(buffer.slice(offset, offset + sz)),
      ]);

      offset += chunksize;
    }

    return alldata;
  },

  // getDynamicEntries is Vial-specific way to get multiple entries.
  // Not a buffer, but call 1 = item 1, call 2 = item 2, etc.
  getDynamicEntries: async (cmd, count, opts) => {
    const alldata = [];
    if (!opts) opts = {};
    for (let i = 0; i < count; i++) {
      const data = await VialUSB.sendVial(
        VialUSB.CMD_VIAL_DYNAMIC_ENTRY_OP,
        [cmd, i],
        opts,
      );
      alldata.push(data);
    }
    return alldata;
  },
});

export const Vial = {
  load: async function (kbinfo) {
    // the .xz-compressed Vial information.
    await Vial.getKeyboardInfo(kbinfo);

    // Load combos, macros, etc.
    await kb.getFeatures(kbinfo);

    // Regenerate keycodes for macros and features.
    await KEY.generateAllKeycodes(kbinfo);

    // Keymap: all layers + all keys.
    await kb.getKeyMap(kbinfo);

    // Get various memory buffers:
    await Vial.macro.get(kbinfo);
    await Vial.combo.get(kbinfo);
    await Vial.key_override.get(kbinfo);
    await Vial.tapdance.get(kbinfo);
    await Vial.qmk.get(kbinfo);

    // await Vial.getKeyBuffers(kbinfo);

    // Visual layout.
    // await kb.getKeyLayout(kbinfo);
    return kbinfo;
  },

  getKeyboardInfo: async (kbinfo) => {
    let ret;

    // VIA Protocol. It's a byte followed by a short... big-endian
    kbinfo.via_proto = await VialUSB.send(
      VialUSB.CMD_VIA_GET_PROTOCOL_VERSION,
      [],
      { unpack: "B>H", index: 1 },
    );

    // Vial protocol (int) and Keyboard ID (long long), little endian.
    const vial_kbid = await VialUSB.sendVial(
      VialUSB.CMD_VIAL_GET_KEYBOARD_ID,
      [],
      { unpack: "I<Q" },
    );
    kbinfo.vial_proto = vial_kbid[0];
    kbinfo.kbid = vial_kbid[1].toString();

    // Vial KB info is via an xz-compressed JSON blob. Fetched 32 bytes
    // at a time.
    //
    // This mostly contains our layout visualizer for the GUI.
    const payload_size = await VialUSB.sendVial(VialUSB.CMD_VIAL_GET_SIZE, [], {
      uint32: true,
      index: 0,
    });

    let block = 0;
    let sz = payload_size;
    let payload = new ArrayBuffer(payload_size);
    let pdv = new DataView(payload);
    let offset = 0;
    while (sz > 0) {
      let data = await VialUSB.sendVial(
        VialUSB.CMD_VIAL_GET_DEFINITION,
        [...LE32(block)],
        { uint8: true },
      );

      for (let i = 0; i < MSG_LEN && offset < payload_size; i++) {
        pdv.setInt8(offset, data[i]);
        offset += 1;
      }
      sz = sz - MSG_LEN;
      block += 1;
    }
    // Decompress and deJSONify
    const up = [...new Int8Array(payload)];

    payload = JSON.parse(await decompress(new Uint8Array(up).buffer));
    kbinfo.payload = payload;

    kbinfo.rows = payload.matrix.rows;
    kbinfo.cols = payload.matrix.cols;
    kbinfo.custom_keycodes = payload.customKeycodes;

    return kbinfo;
  },

  pollMatrix: async (kbinfo) => {
    let data = await VialUSB.send(VialUSB.CMD_VIA_GET_KEYBOARD_VALUE, [
      VialUSB.VIA_SWITCH_MATRIX_STATE,
    ]);
    const rowbytes = Math.ceil(kbinfo.cols / 8);
    // First two bytes of each row are VIA's confirmation.
    let offset = 2;

    const kmpressed = [];
    for (let row = 0; row < kbinfo.rows; row++) {
      const rowpressed = [];
      const coldata = data.slice(offset, offset + rowbytes);
      for (let col = 0; col < kbinfo.cols; col++) {
        const colbyte = Math.floor(col / 8);
        const colbit = 1 << col % 8;
        if ((coldata[colbyte] & colbit) !== 0) {
          rowpressed.push(true);
        } else {
          rowpressed.push(false);
        }
      }
      offset += rowbytes;
      kmpressed.push(rowpressed);
    }
    return kmpressed;
  },
};
