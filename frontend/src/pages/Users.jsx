import React, { useEffect, useState } from "react";

// Make sure API_BASE matches your backend URL
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function Users({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch all users from backend
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users`);
        if (!res.ok) throw new Error("Failed to fetch users");
        const data = await res.json();
        setUsers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Update user role (admin/instructor)
  const updateUserRole = async (id, field, value) => {
    try {
      const res = await fetch(`${API_BASE}/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updatedUser = await res.json();
      setUsers(users.map(u => (u.id === id ? updatedUser : u)));
    } catch (err) {
      setError(err.message);
    }
  };
  
  useEffect(() => {
    // ===== MOCK DATA FOR TESTING =====
    const mockUsers = [
      { id: 1, email: "admin@example.com", isAdmin: true, isInstructor: false },
      { id: 2, email: "instructor@example.com", isAdmin: false, isInstructor: true },
      { id: 3, email: "user@example.com", isAdmin: false, isInstructor: false },
    ];
  
    // Simulate API delay
    setTimeout(() => {
      setUsers(mockUsers);
      setLoading(false);
    }, 500);
    // ==================================
  }, []);
  

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", paddingTop: "2rem" }}>
      <h2>Users</h2>
      {loading && <p>Loading users…</p>}
      {error && (
        <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>
      )}

      {!loading && users.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Admin</th>
              <th>Instructor</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>
                  {currentUser?.isAdmin ? (
                    <input
                      type="checkbox"
                      checked={user.isAdmin}
                      onChange={() =>
                        updateUserRole(user.id, "isAdmin", !user.isAdmin)
                      }
                    />
                  ) : (
                    <span>{user.isAdmin ? "Yes" : "No"}</span>
                  )}
                </td>
                <td>
                  {currentUser?.isAdmin ? (
                    <input
                      type="checkbox"
                      checked={user.isInstructor}
                      onChange={() =>
                        updateUserRole(
                          user.id,
                          "isInstructor",
                          !user.isInstructor
                        )
                      }
                    />
                  ) : (
                    <span>{user.isInstructor ? "Yes" : "No"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && users.length === 0 && <p>No users found.</p>}
    </div>
  );
}
