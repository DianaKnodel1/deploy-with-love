import { useEffect, useState, useCallback, useRef, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { checkRiskFlag, type EmployeeStatus, type KycStatus, type OnboardingStatus } from "@/lib/status";
export type { EmployeeStatus, KycStatus, OnboardingStatus };
import { useToast } from "@/hooks/use-toast";
import { fetchAll } from "@/lib/fetch-all";

export interface Application {
  id: string; full_name: string; first_name: string | null; last_name: string | null;
  email: string; phone: string | null; message: string | null; status: string; created_at: string; tenant_id: string | null;
  address: string | null; postal_code: string | null; city: string | null;
  birth_date: string | null; birth_place: string | null; nationality: string | null;
}
export interface ProfileRow {
  id: string; user_id: string; full_name: string; status: EmployeeStatus; address: string | null; birth_date: string | null;
  living_since: string | null; created_at: string; contract_signed_at: string | null; onboarding_status: OnboardingStatus;
  admin_notes: string | null;
}
export interface KycRow {
  id: string; user_id: string; status: KycStatus; id_front_url: string | null; id_back_url: string | null; selfie_url: string | null;
  rejection_reason: string | null; risk_flag: boolean; reviewed_at: string | null;
}
export interface TaskTemplate {
  id: string; title: string; description: string; instructions: string; compensation: number; is_active: boolean; created_at: string;
}
export interface TaskQuestion { id: string; question: string; sort_order: number; }
export interface AssignmentRow {
  id: string; task_template_id: string; user_id: string; status: string; admin_comment: string | null; created_at: string; sms_channel_id: string | null;
}
export interface SubmissionRow {
  id: string; assignment_id: string; notes: string | null; file_urls: string[]; submitted_at: string;
}
export interface SubmissionAnswerRow { id: string; question_id: string; answer: string; }
export interface TimeSlotRow { id: string; slot_date: string; start_time: string; end_time: string; max_participants: number; created_at: string; }
export interface BookingRow { id: string; user_id: string; time_slot_id: string | null; assignment_id: string | null; status: string; created_at: string; booking_date: string | null; booking_time: string | null; }
export interface TransactionRow { id: string; user_id: string; assignment_id: string; amount: number; status: string; created_at: string; }
export interface ChatConversationRow { id: string; user_id: string; status: string; escalated_at: string | null; created_at: string; updated_at: string; }

interface AdminDataContextType {
  applications: Application[];
  profiles: ProfileRow[];
  kycList: KycRow[];
  templates: TaskTemplate[];
  assignments: AssignmentRow[];
  timeSlots: TimeSlotRow[];
  allBookings: BookingRow[];
  allTransactions: TransactionRow[];
  chatConversations: ChatConversationRow[];
  adminUserIds: Set<string>;
  emailConfirmedUserIds: Set<string>;
  loading: boolean;
  loadingApplications: boolean;
  loadingProfiles: boolean;
  loadData: () => Promise<void>;
  setProfiles: React.Dispatch<React.SetStateAction<ProfileRow[]>>;
  setKycList: React.Dispatch<React.SetStateAction<KycRow[]>>;
  setAllTransactions: React.Dispatch<React.SetStateAction<TransactionRow[]>>;
  getProfileForUser: (userId: string) => ProfileRow | undefined;
}

const AdminDataContext = createContext<AdminDataContextType | null>(null);

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error("useAdminData must be used within AdminDataProvider");
  return ctx;
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [kycList, setKycList] = useState<KycRow[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>([]);
  const [allBookings, setAllBookings] = useState<BookingRow[]>([]);
  const [allTransactions, setAllTransactions] = useState<TransactionRow[]>([]);
  const [chatConversations, setChatConversations] = useState<ChatConversationRow[]>([]);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [emailConfirmedUserIds, setEmailConfirmedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const loadData = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;
    const isFirst = !hasLoadedOnceRef.current;
    if (isFirst) {
      setLoading(true);
      setLoadingApplications(true);
      setLoadingProfiles(true);
    }

    const track = async <T,>(
      label: string,
      fetcher: () => Promise<T>,
      onSuccess: (value: T) => void,
      onSettled?: () => void,
    ): Promise<{ ok: boolean; label: string }> => {
      try {
        const value = await fetcher();
        onSuccess(value);
        return { ok: true, label };
      } catch (err) {
        console.error(`[AdminData] ${label} konnte nicht geladen werden`, err);
        return { ok: false, label };
      } finally {
        onSettled?.();
      }
    };

    const run = (async () => {
      // Alle Slices unabhängig laden — jede Tabelle wird sofort gesetzt, sobald
      // sie da ist. Pages warten nur auf ihre eigene Slice, nicht auf alle 11.
      const tasks: Promise<{ ok: boolean; label: string }>[] = [
        track("Bewerbungen",
          () => fetchAll<Application>(() => supabase.from("applications").select("*").order("created_at", { ascending: false })),
          setApplications,
          () => setLoadingApplications(false)),
        track("Mitarbeiter",
          () => fetchAll<ProfileRow>(() => supabase.from("profiles").select("*").order("created_at", { ascending: false })),
          setProfiles,
          () => setLoadingProfiles(false)),
        track("KYC",
          () => fetchAll<KycRow>(() => supabase.from("kyc_verifications").select("*").order("created_at", { ascending: false })),
          setKycList),
        track("Aufgaben-Vorlagen",
          () => fetchAll<TaskTemplate>(() => supabase.from("task_templates").select("*").order("created_at", { ascending: false })),
          setTemplates),
        track("Aufgaben",
          () => fetchAll<AssignmentRow>(() => supabase.from("task_assignments").select("*").order("created_at", { ascending: false })),
          setAssignments),
        track("Terminslots",
          () => fetchAll<TimeSlotRow>(() => supabase.from("time_slots").select("*").order("slot_date", { ascending: false })),
          setTimeSlots),
        track("Buchungen",
          () => fetchAll<BookingRow>(() => supabase.from("bookings").select("*").order("created_at", { ascending: false })),
          setAllBookings),
        track("Transaktionen",
          () => fetchAll<TransactionRow>(() => supabase.from("user_transactions").select("*").order("created_at", { ascending: false })),
          setAllTransactions),
        track("Chats",
          () => fetchAll<ChatConversationRow>(() => supabase.from("chat_conversations").select("*").order("created_at", { ascending: false })),
          setChatConversations),
        track("Admin-Rollen",
          () => fetchAll<{ user_id: string; role: string }>(() => supabase.from("user_roles").select("user_id, role").eq("role", "admin")),
          (rows) => setAdminUserIds(new Set(rows.map((r) => r.user_id)))),
        track("E-Mail-Bestätigungen",
          () => (supabase as any).rpc("admin_get_email_confirmations").then((r: any) => (r.data ?? []) as { user_id: string; email_confirmed: boolean }[]),
          (confs) => setEmailConfirmedUserIds(new Set(confs.filter((c) => c.email_confirmed).map((c) => c.user_id)))),
      ];

      // Sobald die schnellste Slice da ist, globales `loading` freischalten.
      // So blockiert kein Admin-Screen mehr auf ALLE 11 Tabellen.
      Promise.race(tasks).then(() => setLoading(false)).catch(() => setLoading(false));

      const results = await Promise.all(tasks);
      const failures = results.filter((r) => !r.ok).map((r) => r.label);
      hasLoadedOnceRef.current = true;
      setLoading(false);
      setLoadingApplications(false);
      setLoadingProfiles(false);

      if (failures.length > 0) {
        toast({
          title: "Admin-Daten nur teilweise geladen",
          description: `Fehlende Bereiche: ${failures.join(", ")}`,
          variant: "destructive",
        });
      }
    })();
    inFlightRef.current = run;
    try { await run; } finally { inFlightRef.current = null; }
  }, [toast]);


  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const getProfileForUser = useCallback((userId: string) => profiles.find((p) => p.user_id === userId), [profiles]);

  return (
    <AdminDataContext.Provider value={{
      applications, profiles, kycList, templates, assignments, timeSlots, allBookings, allTransactions, chatConversations,
      adminUserIds, emailConfirmedUserIds, loading, loadingApplications, loadingProfiles, loadData, setProfiles, setKycList, setAllTransactions, getProfileForUser,
    }}>
      {children}
    </AdminDataContext.Provider>
  );
}
