import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { nhost } from "../nhost";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    const user = session?.user ?? null;
    const isAuthenticated = Boolean(user);

    useEffect(() => {
        const currentSession = nhost.getUserSession();

        setSession(currentSession);
        setLoading(false);
    }, []);

    const signIn = useCallback(async (email, password) => {
        const result = await nhost.auth.signInEmailPassword({
            email,
            password,
        });

        if (result.error) {
            return {
                error: result.error,
                user: null,
            };
        }

        const currentSession = nhost.getUserSession();

        setSession(currentSession);

        return {
            error: null,
            user: currentSession?.user ?? null,
        };
    }, []);

    const signUp = useCallback(async (email, password) => {
        const result = await nhost.auth.signUpEmailPassword({
            email,
            password,
        });

        if (result.error) {
            return {
                error: result.error,
                user: null,
            };
        }

        const currentSession = nhost.getUserSession();

        setSession(currentSession);

        return {
            error: null,
            user: currentSession?.user ?? null,
        };
    }, []);

    const signOut = useCallback(async () => {
        if (!session?.refreshToken) {
            setSession(null);

            return {
                error: null,
            };
        }

        const result = await nhost.auth.signOut({
            refreshToken: session.refreshToken,
        });

        if (result.error) {
            return {
                error: result.error,
            };
        }

        setSession(null);

        return {
            error: null,
        };
    }, [session]);

    const value = useMemo(
        () => ({
            user,
            session,
            isAuthenticated,
            loading,
            signIn,
            signUp,
            signOut,
        }),
        [
            user,
            session,
            isAuthenticated,
            loading,
            signIn,
            signUp,
            signOut,
        ]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }

    return context;
}