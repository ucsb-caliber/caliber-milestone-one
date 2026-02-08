import React, { useEffect, useState } from "react";
import { supabase } from "@supabase/supabase-js";


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
    const fetchRealUsers = async () => {
      try {
        setLoading(true);
        // Fetch directly from Supabase 'user' table
        const { data, error: sbError } = await supabase
          .from('user') 
          .select('*');
        
        if (sbError) throw sbError;
        setUsers(data || []);
      } catch (err) {
        setError("Database Error: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRealUsers();
  }, []);

  const updateUserRole = async (targetUserId, field, newValue) => {
    try {
      const targetUser = users.find(u => u.user_id === targetUserId);
      
      const updatePayload = {
        admin: field === "admin" ? newValue : targetUser.admin,
        teacher: field === "teacher" ? newValue : targetUser.teacher
      };

      const res = await fetch(`${API_BASE}/api/users/${targetUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Update failed");
      }

      const updatedUser = await res.json();
      
      setUsers(users.map(u => (u.user_id === targetUserId ? updatedUser : u)));
    } catch (err) {
      alert("Unauthorized: Only admins can change roles.");
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1.5rem", fontWeight: "500" }}>Users</h1>
      
      {loading && <p>Connecting to Supabase...</p>}
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
            {users.map((user, index) => (
              <tr key={user.user_id} style={{ borderTop: "1px solid #dee2e6" }}>
                <td style={cellStyle}>{index + 1}</td>
                <td style={cellStyle}>{user.first_name || "—"}</td>
                <td style={cellStyle}>{user.last_name || "—"}</td>
                <td style={cellStyle}>{user.email}</td>
                
                {/* Admin Toggle */}
                <td style={cellStyle}>
                  {userIsAdmin ? (
                    <input
                      type="checkbox"
                      checked={user.admin}
                      onChange={(e) => updateUserRole(user.user_id, "admin", e.target.checked)}
                    />
                  ) : (
                    <span>{user.admin ? "true" : "false"}</span>
                  )}
                </td>

                {/* Instructor (Teacher) Toggle */}
                <td style={cellStyle}>
                  {userIsAdmin ? (
                    <input
                      type="checkbox"
                      checked={user.teacher}
                      onChange={(e) => updateUserRole(user.user_id, "teacher", e.target.checked)}
                    />
                  ) : (
                    <span>{user.teacher ? "true" : "false"}</span>
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

const cellStyle = {
  padding: "12px 15px",
  fontSize: "1.1rem",
  borderRight: "1px solid #dee2e6"
};