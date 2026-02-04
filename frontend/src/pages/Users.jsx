import React, { useEffect, useState } from "react";

// Make sure API_BASE matches your backend URL
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function Users({ currentUser }) {
  // To test as admin if currentUser is not provided yet:
  // const testUser = { ...currentUser, isAdmin: true }; 
  const userIsAdmin = currentUser?.isAdmin;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // ===== UPDATED MOCK DATA TO MATCH SCREENSHOT =====
    const mockUsers = [
      { id: 1, firstName: "Pavani", lastName: "Kshirsagar", email: "pkshirsa@ucsb.edu", isAdmin: true, isInstructor: false },
      { id: 2, firstName: "Jane", lastName: "Doe", email: "jane@example.com", isAdmin: false, isInstructor: true },
    ];
  
    // Simulate API delay
    setTimeout(() => {
      setUsers(mockUsers);
      setLoading(false);
    }, 500);
  }, []);

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

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1.5rem", fontWeight: "500" }}>Users</h1>
      
      {loading && <p>Loading users…</p>}
      {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}

      {!loading && users.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #dee2e6" }}>
          <thead style={{ backgroundColor: "#f8f9fa" }}>
            <tr style={{ textAlign: "left" }}>
              <th style={cellStyle}>id</th>
              <th style={cellStyle}>First Name</th>
              <th style={cellStyle}>Last Name</th>
              <th style={cellStyle}>Email</th>
              <th style={cellStyle}>Admin</th>
              <th style={cellStyle}>Instructor</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderTop: "1px solid #dee2e6" }}>
                <td style={cellStyle}>{user.id}</td>
                <td style={cellStyle}>{user.firstName}</td>
                <td style={cellStyle}>{user.lastName}</td>
                <td style={cellStyle}>{user.email}</td>
                <td style={cellStyle}>
                  {userIsAdmin ? (
                    <input
                      type="checkbox"
                      checked={user.isAdmin}
                      onChange={() => updateUserRole(user.id, "isAdmin", !user.isAdmin)}
                    />
                  ) : (
                    <span>{user.isAdmin ? "true" : "false"}</span>
                  )}
                </td>
                <td style={cellStyle}>
                  {userIsAdmin ? (
                    <input
                      type="checkbox"
                      checked={user.isInstructor}
                      onChange={() => updateUserRole(user.id, "isInstructor", !user.isInstructor)}
                    />
                  ) : (
                    <span>{user.isInstructor ? "true" : "false"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Simple styling object for the table cells to match the screenshot spacing
const cellStyle = {
  padding: "12px 15px",
  fontSize: "1.1rem",
  borderRight: "1px solid #dee2e6"
};