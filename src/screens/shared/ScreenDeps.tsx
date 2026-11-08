import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TouchableOpacity,
  View,
  Vibration
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import MapView, { Marker, Polyline, Callout } from "react-native-maps";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth/cordova";
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

import { auth, db } from "../../firebase";
import { useStore } from "../../store";
import { autoLocaleText } from "../../services/i18n";
import {
  assignVolunteerViaApi,
  checkRegistrationConflictsViaApi,
  analyzeRequestWithAiViaApi, chatWithAiViaApi,
  claimRequestViaApi,
  createRequestViaApi,
  exportUserDataViaApi,
  publishAnnouncementViaApi,
  requestDataDeletionViaApi,
  transitionRequestStatusViaApi
} from "../../services/backend";

/**
 * SCREEN-DEPS DOSYA HARITASI
 * - SCREEN-DEPS-CENTRAL: Bu bolum ortak bagimliliklari merkezi olarak toplar.
 * - SCREEN-DEPS-DISA AKTARIM: Bu bolum UI kutuphanelerini, Firebase API'lerini, backend cagrilarini ve ortak sabitleri disa aktarir.
 * - SCREEN-DEPS-PURPOSE: Bu bolum dosyanin amacini ve mimari rolunu ozetler.
 */
const localizeNode = (node: React.ReactNode, locale: "tr" | "en"): React.ReactNode => {
  if (typeof node === "string") return autoLocaleText(locale, node);
  if (Array.isArray(node)) return node.map((item) => localizeNode(item, locale));
  return node;
};

const Text = (props: React.ComponentProps<typeof RNText>) => {
  const locale = useStore((s) => s.locale);
  return <RNText {...props}>{localizeNode(props.children, locale)}</RNText>;
};

const TextInput = React.forwardRef<any, React.ComponentProps<typeof RNTextInput>>((props, ref) => {
  const locale = useStore((s) => s.locale);
  const placeholder = typeof props.placeholder === "string" ? autoLocaleText(locale, props.placeholder) : props.placeholder;
  const handleSubmit = props.onSubmitEditing ?? (props.multiline ? undefined : Keyboard.dismiss);
  return <RNTextInput ref={ref} {...props} placeholder={placeholder} onSubmitEditing={handleSubmit} />;
});
TextInput.displayName = "LocalizedTextInput";

export {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, FlatList, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Vibration,
  LinearGradient, Haptics, Location, MapView, Marker, Polyline, Callout, QRCode, Ionicons, useNavigation,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  auth, db, useStore,
  assignVolunteerViaApi, checkRegistrationConflictsViaApi, analyzeRequestWithAiViaApi, chatWithAiViaApi, claimRequestViaApi, createRequestViaApi,
  exportUserDataViaApi, publishAnnouncementViaApi, requestDataDeletionViaApi, transitionRequestStatusViaApi
};

export * from "./ScreenConstants";
export * from "./ScreenTypes";
export * from "./ScreenHelpers";
export * from "./ScreenStyles";
export * from "./ScreenSharedUi";
