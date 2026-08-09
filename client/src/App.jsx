// import { useAuth } from "./lib/auth/AuthProvider";

// function App() {
//   const {
//     user,
//     isAuthenticated,
//     loading,
//   } = useAuth();

//   if (loading) {
//     return <h1>Loading authentication...</h1>;
//   }

//   return (
//     <div>
//       <h1>FlowForge AI</h1>

//       {isAuthenticated ? (
//         <div>
//           <p>Authenticated</p>
//           <p>Email: {user.email}</p>
//           <p>User ID: {user.id}</p>
//         </div>
//       ) : (
//         <p>Not authenticated</p>
//       )}
//     </div>
//   );
// }

// export default App; 



import { useState } from "react";
import { useAuth } from "./lib/auth/AuthProvider";

function App() {
  const {
    user,
    isAuthenticated,
    loading,
    signIn,
    signOut,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();

    setError("");
    setLoginLoading(true);

    const result = await signIn(email, password);

    if (result.error) {
      setError(result.error.message);
    }

    setLoginLoading(false);
  };

  const handleLogout = async () => {
    const result = await signOut();

    if (result.error) {
      setError(result.error.message);
    }
  };

  if (loading) {
    return <h1>Loading authentication...</h1>;
  }

  return (
    <div>
      <h1>FlowForge AI</h1>

      {isAuthenticated ? (
        <div>
          <p>Authenticated: {user.email}</p>

          <p>
            User ID: <strong>{user.id}</strong>
          </p>

          <button onClick={handleLogout}>
            Logout
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin}>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loginLoading}>
            {loginLoading ? "Signing in..." : "Login"}
          </button>

          {error && <p>{error}</p>}
        </form>
      )}
    </div>
  );
}

export default App;