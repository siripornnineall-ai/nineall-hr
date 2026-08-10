import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      Alert.alert("รหัสผ่านสั้นเกินไป", "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    setChanging(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error && profile) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", profile.profileId);
    }
    setChanging(false);
    if (error) {
      Alert.alert("ผิดพลาด", error.message);
    } else {
      setNewPassword("");
      Alert.alert("สำเร็จ", "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={36} color="#fff" />
          </View>
          <Text style={styles.name}>{profile?.fullName}</Text>
          <Text style={styles.code}>{profile?.employeeCode}</Text>
        </View>

        {profile?.mustChangePassword && (
          <View style={styles.warningBanner}>
            <MaterialIcons name="warning" size={18} color="#c2760a" />
            <Text style={styles.warningText}>กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานครั้งแรก</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>เปลี่ยนรหัสผ่าน</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
          />
          <Pressable style={styles.button} onPress={handleChangePassword} disabled={changing}>
            <Text style={styles.buttonText}>{changing ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ความเป็นส่วนตัว</Text>
          <Text style={styles.privacyText}>
            แอปนี้เก็บข้อมูลตำแหน่ง GPS และภาพเซลฟีเฉพาะขณะลงเวลาเข้า-ออกงานเท่านั้น ไม่มีการติดตามตำแหน่งพนักงานตลอดเวลา ข้อมูลเงินเดือนและเอกสารส่วนตัว
            จัดเก็บแบบส่วนตัว (Private Storage) และเข้าถึงได้เฉพาะผู้ที่เกี่ยวข้องเท่านั้น
          </Text>
        </View>

        <Pressable style={styles.logoutButton} onPress={signOut}>
          <MaterialIcons name="logout" size={18} color={theme.colors.danger} />
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.surfaceCream },
  header: { alignItems: "center", marginBottom: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.primaryContainer, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  name: { fontSize: 18, fontWeight: "800" },
  code: { fontSize: 13, color: theme.colors.onSurfaceVariant },
  warningBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff7ed", padding: 12, borderRadius: 12, marginBottom: 16 },
  warningText: { color: "#9a3412", fontSize: 12, flex: 1 },
  section: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 16, gap: 10 },
  sectionTitle: { fontWeight: "700", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: theme.colors.outlineVariant, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  button: { height: 48, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  privacyText: { fontSize: 12, color: theme.colors.onSurfaceVariant, lineHeight: 18 },
  logoutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  logoutText: { color: theme.colors.danger, fontWeight: "700" },
});
