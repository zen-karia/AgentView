import { useAuth0 } from "@auth0/auth0-react";

function displayInitial(name?: string, email?: string): string {
  return (name?.trim() || email?.trim() || "U").charAt(0).toUpperCase();
}

export function UserMenu() {
  const { logout, user } = useAuth0();
  const displayName = user?.name || user?.nickname || user?.email || "Signed-in user";

  return (
    <details className="auth-user-menu">
      <summary aria-label={`Account menu for ${displayName}`}>
        <span className="auth-user-menu__avatar" aria-hidden={!user?.picture}>
          {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : displayInitial(user?.name, user?.email)}
        </span>
        <span className="auth-user-menu__summary-copy">
          <strong>{displayName}</strong>
          <small>Workspace owner</small>
        </span>
        <span className="auth-user-menu__chevron" aria-hidden="true">⌄</span>
      </summary>

      <div className="auth-user-menu__popover">
        <div className="auth-user-menu__identity">
          <span className="auth-user-menu__avatar auth-user-menu__avatar--large">
            {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : displayInitial(user?.name, user?.email)}
          </span>
          <div>
            <strong>{displayName}</strong>
            {user?.email && <span>{user.email}</span>}
          </div>
        </div>
        <div className="auth-user-menu__subject">
          <span>Identity</span>
          <code title={user?.sub}>{user?.sub || "Auth0 user"}</code>
        </div>
        <button
          type="button"
          onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          <span aria-hidden="true">↗</span>
          Log out
        </button>
      </div>
    </details>
  );
}
