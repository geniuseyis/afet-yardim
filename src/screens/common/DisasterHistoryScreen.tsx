import {
  React, useEffect, useState,
  FlatList, Text, TouchableOpacity, View,
  LinearGradient, Ionicons, useNavigation,
  collection, onSnapshot, orderBy, query, where, db, useStore, toMillis
} from "../shared/ScreenDeps";
import { RefreshControl } from "react-native";
import { l } from "../../services/i18n";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonList } from "../../components/SkeletonLoader";

type HistoryItem = {
  id: string;
  type?: string;
  status?: string;
  urgency?: string;
  description?: string;
  createdAt?: any;
  closedAt?: any;
  assignedVolunteerId?: string;
  location?: { lat?: number; lng?: number; label?: string };
};

const statusColor = (status?: string) => {
  if (status === "closed") return "#22c55e";
  if (status === "in_progress") return "#3b82f6";
  if (status === "assigned") return "#f59e0b";
  return "#ef4444";
};

const urgencyColor = (u?: string) => {
  const s = `${u || ""}`.toLowerCase();
  if (s.includes("acil") || s.includes("high")) return "#ef4444";
  if (s.includes("orta") || s.includes("medium")) return "#f59e0b";
  return "#22c55e";
};

export const DisasterHistoryScreen = () => {
  const navigation = useNavigation<any>();
  const { user, userData } = useStore();
  const locale = useStore((s) => s.locale);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const shell = lightMode ? "#f1f5f9" : amoledMode ? "#050507" : "#12060a";
  const panel = lightMode ? "#ffffff" : amoledMode ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.04)";
  const softBorder = lightMode ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)";
  const textPrimary = lightMode ? "#0f172a" : "#fff1f2";
  const textSec = lightMode ? "#475569" : "#fecdd3";
  const textMuted = lightMode ? "#64748b" : "#fda4af";

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const role = userData?.role;
    let q;
    if (role === "volunteer") {
      q = query(collection(db, "requests"), where("assignedVolunteerId", "==", user.uid), orderBy("createdAt", "desc"));
    } else {
      q = query(collection(db, "requests"), where("createdBy", "==", user.uid), orderBy("createdAt", "desc"));
    }
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
      setRefreshing(false);
    }, () => {
      setLoading(false);
      setRefreshing(false);
    });
  }, [user?.uid, userData?.role]);

  const formatDate = (ms: number) =>
    ms ? new Date(ms).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Istanbul"
    }) : "-";

  const renderItem = ({ item, index }: { item: HistoryItem; index: number }) => {
    const ms = toMillis(item.createdAt);
    const isLast = index === items.length - 1;
    const sc = statusColor(item.status);
    const uc = urgencyColor(item.urgency);

    return (
      <View style={{ flexDirection: "row", paddingHorizontal: 16 }}>
        {/* Timeline column */}
        <View style={{ alignItems: "center", width: 30, marginRight: 12 }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: sc, borderWidth: 2, borderColor: shell, marginTop: 16 }} />
          {!isLast ? <View style={{ width: 2, flex: 1, backgroundColor: softBorder, marginTop: 2, minHeight: 20 }} /> : null}
        </View>

        {/* Card */}
        <View style={{ flex: 1, marginBottom: 12 }}>
          <View style={{ borderRadius: 16, backgroundColor: panel, borderWidth: 1, borderColor: softBorder, padding: 13 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ color: textPrimary, fontFamily: "Inter-Bold", fontSize: 14 }} numberOfLines={1}>
                {item.type || L("Yardım Talebi", "Aid Request")}
              </Text>
              <View style={{ borderRadius: 999, backgroundColor: `${uc}1a`, borderWidth: 1, borderColor: `${uc}40`, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: uc, fontFamily: "Inter-Bold", fontSize: 10 }}>
                  {item.urgency || L("Düşük", "Low")}
                </Text>
              </View>
            </View>

            {item.description ? (
              <Text style={{ color: textSec, fontFamily: "Inter", fontSize: 12, marginBottom: 8 }} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sc }} />
                <Text style={{ color: sc, fontFamily: "Inter-Bold", fontSize: 11 }}>
                  {item.status === "closed" ? L("Tamamlandı", "Completed") :
                   item.status === "in_progress" ? L("Devam Ediyor", "In Progress") :
                   item.status === "assigned" ? L("Atandı", "Assigned") : L("Açık", "Open")}
                </Text>
              </View>
              <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{formatDate(ms)}</Text>
            </View>

            {item.assignedVolunteerId ? (
              <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4, borderTopWidth: 1, borderTopColor: softBorder, paddingTop: 8 }}>
                <Ionicons name="person-outline" size={12} color={textMuted} />
                <Text style={{ color: textMuted, fontFamily: "Inter", fontSize: 11 }}>{L("Gönüllü atandı", "Volunteer assigned")}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: shell }}>
      {/* Header */}
      <LinearGradient
        colors={lightMode ? ["#9f1239", "#be123c"] : amoledMode ? ["#17070c", "#0d050a"] : ["#430914", "#23070f"] as any}
        style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={18} color="white" />
          </TouchableOpacity>
          <View>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Inter", fontSize: 12 }}>{L("Geçmiş", "History")}</Text>
            <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 22 }}>{L("Afet Geçmişim", "My Disaster History")}</Text>
          </View>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.65)", fontFamily: "Inter", fontSize: 12, marginTop: 8 }}>
          {items.length} {L("kayıt listeleniyor", "records listed")}
        </Text>
      </LinearGradient>

      {loading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList count={4} lightMode={lightMode} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} tintColor="#ef4444" colors={["#ef4444"]} />}
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <EmptyState
                icon="time-outline"
                title={L("Geçmiş kayıt yok", "No history records")}
                sub={L("Talep oluşturduğunuzda veya görev üstlendiğinizde burada görüntülenir.", "Records appear here when you create requests or accept missions.")}
                lightMode={lightMode}
              />
            </View>
          }
        />
      )}
    </View>
  );
};
