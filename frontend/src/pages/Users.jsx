import React, { useEffect, useState } from "react";
import { getAllUsers, updateUserRoles } from "../api";

export default function Users({ currentUser }) {
    // Use 'admin' as per your backend main.py
    const userIsAdmin = currentUser?.admin || false;
  
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updating, setUpdating] = useState({});
    const [sortConfig, setSortConfig] = useState({ key: "id", direction: "asc" });
    const [pendingOpen, setPendingOpen] = useState(true);
  
    useEffect(() => {
      async function getData() {
        try {
          setLoading(true);
          const data = await getAllUsers();
          setUsers(data.users || []);
        } catch (err) {
          console.error("User fetch error:", err);
          setError("Failed to load users: " + err.message);
        } finally {
          setLoading(false);
        }
      }
      getData();
    }, []);
  
    const cellStyle = {
      padding: "12px 15px",
      fontSize: "1.1rem",
      borderRight: "1px solid #dee2e6",
      borderBottom: "1px solid #dee2e6"
    };
  
    // Render a colored box for True/False
    function RoleBox({ value, disabled, onClick, label }) {
      const base = {
        display: "inline-block",
        width: 80, // Fixed width for all buttons
        minWidth: 60,
        padding: "6px 0", // Remove horizontal padding to keep width fixed
        borderRadius: 8,
        color: "white",
        fontWeight: 600,
        textAlign: "center",
        background: value ? "#007bff" : "#003366", // True: blue, False: darker blue
        opacity: disabled ? 0.5 : 1,
        cursor: disabled || !onClick ? "not-allowed" : "pointer",
        userSelect: "none",
        border: "none",
        outline: "none",
        fontSize: "1rem",
        transition: "background 0.2s, opacity 0.2s, box-shadow 0.2s",
        boxShadow: "none"
      };
      const [hover, setHover] = React.useState(false);
      const hoverStyle = !disabled && onClick && hover ? {
        background: value ? "#0056b3" : "#002244",
        boxShadow: "0 0 0 2px #007bff33"
      } : {};
      return (
        <span
          style={{ ...base, ...hoverStyle }}
          onClick={disabled || !onClick ? undefined : onClick}
          aria-label={label}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {value ? "True" : "False"}
        </span>
      );
    }
  
    // Toggle admin or teacher role for a user
    async function handleToggleRole(userId, role, value) {
      setUpdating((prev) => ({ ...prev, [userId]: true }));
      try {
        await updateUserRoles(userId, { [role]: value });
        setUsers((prev) => prev.map(u => u.user_id === userId ? { ...u, [role]: value } : u));
      } catch (err) {
        alert("Failed to update user: " + err.message);
      } finally {
        setUpdating((prev) => ({ ...prev, [userId]: false }));
      }
    }

    async function handleApproveInstructor(userId) {
      setUpdating((prev) => ({ ...prev, [userId]: true }));
      try {
        await updateUserRoles(userId, { teacher: true, pending: false });
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId ? { ...u, teacher: true, pending: false } : u
          )
        );
      } catch (err) {
        alert("Failed to approve instructor: " + err.message);
      } finally {
        setUpdating((prev) => ({ ...prev, [userId]: false }));
      }
    }

    async function handleDismissPending(userId) {
      setUpdating((prev) => ({ ...prev, [userId]: true }));
      try {
        await updateUserRoles(userId, { pending: false });
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId ? { ...u, pending: false } : u
          )
        );
      } catch (err) {
        alert("Failed to dismiss request: " + err.message);
      } finally {
        setUpdating((prev) => ({ ...prev, [userId]: false }));
      }
    }

    function handleSort(key) {
      setSortConfig((prev) => {
        if (prev.key === key) {
          return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
        }
        return { key, direction: "asc" };
      });
    }

    function getSortedUsers(users) {
      const sorted = [...users];
      sorted.sort((a, b) => {
        let aVal = a[sortConfig.key] ?? "";
        let bVal = b[sortConfig.key] ?? "";
        if (typeof aVal === "string" && typeof bVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
      return sorted;
    }

    const arrow = (col) => sortConfig.key === col ? (sortConfig.direction === "asc" ? "▲" : "▼") : "▼";
    const pendingUsers = users.filter((u) => !!u.pending);

    return (
      <div style={{ padding: "2rem", background: "white", minHeight: "100vh" }}>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "1.5rem" }}>User Management</h1>
        
        {loading && <p>Searching database...</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        <div style={{ marginBottom: "2rem" }}>
          <button
            onClick={() => setPendingOpen((prev) => !prev)}
            style={{
              width: "100%",
              textAlign: "left",
              border: "1px solid #dee2e6",
              borderRadius: "8px 8px 0 0",
              background: "#f8f9fa",
              padding: "0.75rem 1rem",
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "#111827",
              cursor: "pointer"
            }}
          >
            <span style={{ marginRight: "0.5rem", fontSize: "0.85rem" }}>{pendingOpen ? "▼" : "▶"}</span>
            Pending Instructor Requests ({pendingUsers.length})
          </button>
          {pendingOpen && (
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #dee2e6", borderTop: "none" }}>
              <thead style={{ backgroundColor: "#f8f9fa" }}>
                <tr style={{ textAlign: "left" }}>
                  <th style={cellStyle}>id</th>
                  <th style={cellStyle}>First Name</th>
                  <th style={cellStyle}>Last Name</th>
                  <th style={{ ...cellStyle, width: "30%" }}>Email</th>
                  <th style={{ ...cellStyle, width: "18%", whiteSpace: "nowrap" }}>Approve/Deny</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.length > 0 ? pendingUsers.map((u) => (
                  <tr key={`pending-${u.user_id}`}>
                    <td style={cellStyle}>{u.id}</td>
                    <td style={cellStyle}>{u.first_name || "—"}</td>
                    <td style={cellStyle}>{u.last_name || "—"}</td>
                    <td style={cellStyle}>{u.email || "—"}</td>
                    <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                      {userIsAdmin ? (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <button
                            disabled={!!updating[u.user_id]}
                            onClick={() => handleApproveInstructor(u.user_id)}
                            style={{
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 10px",
                              background: "#16a34a",
                              color: "white",
                              cursor: updating[u.user_id] ? "not-allowed" : "pointer",
                              opacity: updating[u.user_id] ? 0.6 : 1,
                              fontWeight: 600,
                              minWidth: 88
                            }}
                            onMouseEnter={(e) => {
                              if (!updating[u.user_id]) e.currentTarget.style.background = "#15803d";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#16a34a";
                            }}
                          >
                            Approve
                          </button>
                          <button
                            disabled={!!updating[u.user_id]}
                            onClick={() => handleDismissPending(u.user_id)}
                            style={{
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 10px",
                              minWidth: 88,
                              background: "#dc2626",
                              color: "white",
                              cursor: updating[u.user_id] ? "not-allowed" : "pointer",
                              opacity: updating[u.user_id] ? 0.6 : 1,
                              fontWeight: 700
                            }}
                            title="Cancel instructor request"
                            aria-label="Deny Request"
                            onMouseEnter={(e) => {
                              if (!updating[u.user_id]) e.currentTarget.style.background = "#b91c1c";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#dc2626";
                            }}
                          >
                            Deny
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "#6b7280" }}>Admin action required</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="5" style={{ padding: "20px" }}>No pending instructor requests.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
  
        <div style={{ marginBottom: "2rem" }}>
          <div
            style={{
              border: "1px solid #dee2e6",
              borderRadius: "8px 8px 0 0",
              background: "#f8f9fa",
              padding: "0.75rem 1rem",
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "#111827"
            }}
          >
            Users ({users.length})
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #dee2e6", borderTop: "none" }}>
          <thead style={{ backgroundColor: "#f8f9fa" }}>
            <tr style={{ textAlign: "left" }}>
              <th style={cellStyle}>
                <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("id")}>id <span style={{ fontSize: 12 }}>{arrow("id")}</span></span>
              </th>
              <th style={cellStyle}>
                <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("first_name")}>First Name <span style={{ fontSize: 12 }}>{arrow("first_name")}</span></span>
              </th>
              <th style={cellStyle}>
                <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("last_name")}>Last Name <span style={{ fontSize: 12 }}>{arrow("last_name")}</span></span>
              </th>
              <th style={cellStyle}>
                <span style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("email")}>Email <span style={{ fontSize: 12 }}>{arrow("email")}</span></span>
              </th>
              <th style={cellStyle}>Admin</th>
              <th style={cellStyle}>Instructor</th>
            </tr>
          </thead>
          <tbody>
            {users.length > 0 ? getSortedUsers(users).map((u, i) => (
              <tr key={u.user_id || i}>
                <td style={cellStyle}>{u.id}</td>
                <td style={cellStyle}>{u.first_name || "—"}</td>
                <td style={cellStyle}>{u.last_name || "—"}</td>
                <td style={cellStyle}>{u.email}</td>
                <td style={cellStyle}>
                  {userIsAdmin ? (
                    currentUser.user_id === u.user_id ? (
                      <RoleBox value={!!u.admin} disabled label="Admin (self)" />
                    ) : (
                      <RoleBox
                        value={!!u.admin}
                        disabled={!!updating[u.user_id]}
                        onClick={() => handleToggleRole(u.user_id, "admin", !u.admin)}
                        label="Admin toggle"
                      />
                    )
                  ) : (
                    <RoleBox value={!!u.admin} disabled label="Admin" />
                  )}
                </td>
                <td style={cellStyle}>
                  {userIsAdmin || currentUser.user_id === u.user_id ? (
                    <RoleBox
                      value={!!u.teacher}
                      disabled={!!updating[u.user_id]}
                      onClick={() => handleToggleRole(u.user_id, "teacher", !u.teacher)}
                      label={currentUser.user_id === u.user_id ? "Instructor (self toggle)" : "Instructor toggle"}
                    />
                  ) : (
                    <RoleBox value={!!u.teacher} disabled label="Instructor" />
                  )}
                </td>
              </tr>
            )) : (
              <tr><td colSpan="6" style={{padding: "20px"}}>No users found.</td></tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
    );
  }
