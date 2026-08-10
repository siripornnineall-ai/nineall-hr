import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";

type Phase = "idle" | "requesting" | "capturing" | "uploading" | "done" | "error";

export default function AttendanceScreen() {
  const { profile } = useAuth();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [alreadyClockedIn, setAlreadyClockedIn] = useState(false);
  const [alreadyClockedOut, setAlreadyClockedOut] = useState(false);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  useEffect(() => {
    checkTodayStatus();
  }, [profile]);

  async function checkTodayStatus() {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("attendance_records")
      .select("clock_in_server_at, clock_out_server_at")
      .eq("employee_id", profile.employeeId)
      .eq("work_date", today)
      .maybeSingle();
    setAlreadyClockedIn(Boolean(data?.clock_in_server_at));
    setAlreadyClockedOut(Boolean(data?.clock_out_server_at));
  }

  async function handlePunch() {
    setMessage(null);
    setPhase("requesting");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("แอปต้องการสิทธิ์เข้าถึงตำแหน่งเพื่อลงเวลา");
      }
      const position = await Location.getCurrentPositionAsync({});

      setPhase("capturing");
      if (!cameraRef.current) throw new Error("กล้องยังไม่พร้อม กรุณาลองใหม่");
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false });
      if (!photo) throw new Error("ถ่ายภาพไม่สำเร็จ");

      setPhase("uploading");
      const path = `${profile!.orgId}/${profile!.employeeId}/${Date.now()}.jpg`;
      const response = await fetch(photo.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage.from("selfies").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${uploadError.message}`);

      const functionName = alreadyClockedIn ? "clock-out" : "clock-in";
      const { data, error: fnError } = await supabase.functions.invoke(functionName, {
        body: {
          deviceAt: new Date().toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy ?? 0,
          selfiePath: path,
          isOfflineSubmission: false,
        },
      });

      if (fnError || !data?.ok) {
        throw new Error(data?.error ?? fnError?.message ?? "บันทึกเวลาไม่สำเร็จ");
      }

      setPhase("done");
      setMessage(alreadyClockedIn ? "บันทึกเวลาออกงานสำเร็จ!" : "บันทึกเวลาเข้างานสำเร็จ!");
      await checkTodayStatus();
    } catch (error) {
      setPhase("error");
      const msg = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
      setMessage(msg);
      Alert.alert("ไม่สำเร็จ", msg);
    }
  }

  if (!cameraPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionText}>แอปต้องการสิทธิ์ใช้กล้องเพื่อถ่ายภาพเซลฟียืนยันตัวตนตอนลงเวลา</Text>
        <Pressable style={styles.permissionButton} onPress={requestCameraPermission}>
          <Text style={styles.permissionButtonText}>อนุญาตใช้กล้อง</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (alreadyClockedIn && alreadyClockedOut) {
    return (
      <SafeAreaView style={styles.center}>
        <MaterialIcons name="check-circle" size={48} color={theme.colors.success} />
        <Text style={styles.doneText}>คุณลงเวลาเข้าและออกงานวันนี้เรียบร้อยแล้ว</Text>
      </SafeAreaView>
    );
  }

  const busy = phase === "requesting" || phase === "capturing" || phase === "uploading";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.title}>{alreadyClockedIn ? "ลงเวลาออกงาน" : "ลงเวลาเข้างาน"}</Text>
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        <View pointerEvents="none" style={styles.frame} />
      </View>

      <Text style={styles.hint}>*ระบบจะบันทึกใบหน้าและพิกัด GPS เพื่อความปลอดภัยและยืนยันตัวตน</Text>

      {message && phase !== "done" && <Text style={styles.errorMsg}>{message}</Text>}
      {message && phase === "done" && <Text style={styles.successMsg}>{message}</Text>}

      <Pressable style={[styles.punchButton, busy && { opacity: 0.6 }]} onPress={handlePunch} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="fingerprint" size={26} color="#fff" />
            <Text style={styles.punchButtonText}>{alreadyClockedIn ? "ลงเวลาออกงาน" : "ลงเวลาเข้างาน"}</Text>
          </>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.surfaceCream, paddingHorizontal: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32, backgroundColor: theme.colors.surfaceCream },
  title: { fontSize: 20, fontWeight: "800", color: theme.colors.primary, marginTop: 12, marginBottom: 16, textAlign: "center" },
  cameraWrap: { aspectRatio: 4 / 5, borderRadius: 24, overflow: "hidden", backgroundColor: "#000" },
  camera: { flex: 1 },
  frame: {
    position: "absolute",
    top: "20%",
    left: "20%",
    right: "20%",
    bottom: "20%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
    borderRadius: 24,
  },
  hint: { textAlign: "center", fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 16 },
  errorMsg: { textAlign: "center", color: theme.colors.danger, marginTop: 8, fontWeight: "600" },
  successMsg: { textAlign: "center", color: theme.colors.success, marginTop: 8, fontWeight: "600" },
  punchButton: {
    marginTop: 16,
    marginBottom: 24,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  punchButtonText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  permissionText: { textAlign: "center", color: theme.colors.onSurfaceVariant },
  permissionButton: { backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  permissionButtonText: { color: "#fff", fontWeight: "700" },
  doneText: { textAlign: "center", fontWeight: "600", color: theme.colors.onSurface },
});
