// Preset demo identity, the same one the server acts as (see MODERATOR in lib/firestore.ts).
const USER = { name: "Daniel Ho", initials: "DH", role: "Moderator", handle: "DanielHo" };

// Avatar + name and role. Shown in the top right of each page, and in the top bar on phones and small tablets.
export default function Profile() {
  return (
    <div className="profile">
      <div className="avatar">{USER.initials}</div>
      <div className="profile-text">
        <h4 className="trunc">{USER.name}</h4>
        <small className="trunc">
          {USER.role}
          <span className="handle"> · {USER.handle}</span>
        </small>
      </div>
    </div>
  );
}
