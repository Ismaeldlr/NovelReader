import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createStyles, useTheme } from "../../../../../src/theme";

import ReaderInfoTab from "./tabs/ReaderInfoTab";
import ReaderFontTab from "./tabs/ReaderFontTab";
import ReaderSettingsTab from "./tabs/ReaderSettingsTab";
import ReaderMoreTab from "./tabs/ReaderMoreTab";

export type PanelKey = "info" | "font" | "settings" | "more";

type Props = {
  open: boolean;
  onClose: () => void;

  panel: PanelKey;
  onChangePanel: (p: PanelKey) => void;

  // Info tab
  idx: number;
  total: number;
  readPct: number;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenContents: () => void;
  onOpenAbout: () => void;

  // Font tab
  fontFamily?: string;
  fontSize: number;
  lineHeight: number | "default";
  onFontFamily: (f?: string) => void;
  onFontSize: (n: number) => void;
  onLineHeight: (v: number | "default") => void;
};

export default function ReaderSheet(props: Props) {
  const { open, onClose, panel, onChangePanel } = props;
  const { theme } = useTheme();
  const s = styles(theme);

  const slide = useRef(new Animated.Value(0)).current; // 0 hidden, 1 shown

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [open]);

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0], // sheet height
  });

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />

      <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
        {/* Content area */}
        <View style={s.content}>
          {panel === "info" && (
            <ReaderInfoTab
              idx={props.idx}
              total={props.total}
              readPct={props.readPct}
              prevDisabled={props.prevDisabled}
              nextDisabled={props.nextDisabled}
              onPrev={props.onPrev}
              onNext={props.onNext}
              onOpenContents={props.onOpenContents}
              onOpenAbout={props.onOpenAbout}
            />
          )}
          {panel === "font" && (
            <ReaderFontTab
              fontFamily={props.fontFamily}
              fontSize={props.fontSize}
              lineHeight={props.lineHeight}
              onFontFamily={props.onFontFamily}
              onFontSize={props.onFontSize}
              onLineHeight={props.onLineHeight}
            />
          )}
          {panel === "settings" && <ReaderSettingsTab />}
          {panel === "more" && <ReaderMoreTab />}
        </View>

        {/* Tabs row (icons only) */}
        <View style={s.tabsRow}>
          <TabIcon icon="book-outline" active={panel === "info"} onPress={() => onChangePanel("info")} />
          <TabIcon icon="text" active={panel === "font"} onPress={() => onChangePanel("font")} />
          <TabIcon icon="settings-outline" active={panel === "settings"} onPress={() => onChangePanel("settings")} />
          <TabIcon icon="reorder-three-outline" active={panel === "more"} onPress={() => onChangePanel("more")} />
        </View>
      </Animated.View>
    </Modal>
  );
}

function TabIcon({ icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1, alignItems: "center", paddingVertical: 10, opacity: pressed ? 0.75 : 1 }]}>
      <Ionicons name={icon} size={22} color={active ? theme.colors.text : theme.colors.textDim} />
    </Pressable>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    backgroundColor: t.colors.card,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  content: { gap: 10 },
  tabsRow: {
    marginTop: 8,
    flexDirection: "row",
    backgroundColor: t.colors.bgElevated,
    borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
}));
