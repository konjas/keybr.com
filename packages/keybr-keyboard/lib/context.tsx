import { useSettings } from "@keybr/settings";
import { getKeymap } from "@keybr/sval";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { Geometry } from "./geometry.ts";
import { DATAHAND } from "./geometry/datahand.ts";
import { Keyboard } from "./keyboard.ts";
import { Layout } from "./layout.ts";
import { loadKeyboard } from "./load.ts";

export const KeyboardContext = createContext<Keyboard>(null!);

export function useKeyboard(): Keyboard {
  const value = useContext(KeyboardContext);
  if (value == null) {
    throw new Error(
      process.env.NODE_ENV !== "production"
        ? "KeyboardContext is missing"
        : undefined,
    );
  }
  return value;
}

export function KeyboardProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const defaultKeyboard = loadKeyboard(Layout.EN_US, Geometry.DATAHAND);

  const [keyboard, setKeyboard] = useState(defaultKeyboard);
  const loadKeymap = async () => {
    let keymap = await getKeymap();
    setKeyboard(
      new Keyboard(Layout.EN_US, Geometry.DATAHAND, keymap, DATAHAND),
    );
  };

  return (
    <KeyboardContext.Provider value={keyboard}>
      <button onClick={loadKeymap}>Load keymap</button>
      {children}
    </KeyboardContext.Provider>
  );
}
