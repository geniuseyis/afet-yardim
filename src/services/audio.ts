type SoundLike = {
  stopAsync?: () => Promise<void>;
  unloadAsync?: () => Promise<void>;
};

const safeRequire = (): ((id: string) => any) | null => {
  try {
    // Dynamic require keeps optional deps from breaking typecheck.
    const r = (0, eval)("require");
    return typeof r === "function" ? (r as (id: string) => any) : null;
  } catch {
    return null;
  }
};

const getAudioApi = async (): Promise<any | null> => {
  try {
    const req = safeRequire();
    const mod: any = req ? req("expo-audio") : null;
    if (mod?.Audio || mod?.default || mod) return mod?.Audio || mod?.default || mod;
  } catch {
    // fallback below
  }

  try {
    const req = safeRequire();
    const mod: any = req ? req("expo-av") : null;
    if (mod?.Audio || mod?.default || mod) return mod?.Audio || mod?.default || mod;
  } catch {
    // fallback below
  }

  return null;
};

export const createLoopingSound = async (uri: string): Promise<SoundLike> => {
  const Audio = await getAudioApi();
  if (!Audio?.Sound?.createAsync) {
    throw new Error("Ses motoru bulunamadi");
  }

  try {
    await Audio.setAudioModeAsync?.({
      playsInSilentModeIOS: true
    });
  } catch {
    // ignore mode errors
  }

  const result = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true, isLooping: true, volume: 1.0 }
  );

  return (result?.sound || result) as SoundLike;
};

export const stopAndUnloadSound = async (soundRef: { current: SoundLike | null }) => {
  try {
    await soundRef.current?.stopAsync?.();
  } catch {
    // noop
  }

  try {
    await soundRef.current?.unloadAsync?.();
  } catch {
    // noop
  }

  soundRef.current = null;
};
