import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    if (!identifier || !password) {
      setError("กรุณากรอกอีเมล/รหัสพนักงาน และรหัสผ่าน");
      return;
    }
    setLoading(true);
    try {
      // lookup_login_email() is a security-definer RPC (0016_login_identifier_lookup.sql) —
      // RLS blocks anonymous reads of profiles/employees directly, so this is the only
      // pre-auth way to resolve an employee code (e.g. "EMP-001") to its login email.
      const { data: email, error: lookupError } = await supabase.rpc("lookup_login_email", { p_identifier: identifier });
      if (lookupError || !email) {
        setError("ไม่พบบัญชีผู้ใช้สำหรับอีเมล/รหัสพนักงานนี้");
        setLoading(false);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("อีเมล/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.content}>
          <Image source={require("../../assets/icon.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>บริษัท ไนน์ ออล กรุ๊ป จำกัด</Text>
          <Text style={styles.subtitle}>Nineall Group Co., Ltd. — ระบบบริหารทรัพยากรบุคคล</Text>

          <View style={styles.form}>
            <Text style={styles.label}>อีเมล หรือ รหัสพนักงาน</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              placeholder="เช่น EMP-001"
              placeholderTextColor="#999"
            />
            <Text style={styles.label}>รหัสผ่าน</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#999"
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceCream },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logo: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 20,
    marginBottom: 16,
  },
  title: { textAlign: "center", fontSize: 24, fontWeight: "800", color: theme.colors.primary },
  subtitle: { textAlign: "center", fontSize: 13, color: theme.colors.onSurfaceVariant, marginTop: 4, marginBottom: 32 },
  form: { backgroundColor: "#fff", borderRadius: 20, padding: 24, gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.onSurfaceVariant, marginTop: 12 },
  input: {
    height: theme.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: { color: theme.colors.danger, fontSize: 13, marginTop: 8 },
  button: {
    height: theme.minTouchTarget,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
