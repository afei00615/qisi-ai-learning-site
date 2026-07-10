export function createAuthService({ authStore }) {
  return {
    login(username, password) {
      const user = authStore.authenticate(username, password);
      if (!user) throw authError(401, "用户名或密码错误");
      return { user, ...authStore.createSession(user.id) };
    },

    authenticate(request) {
      const token = bearerToken(request.headers.authorization);
      const session = authStore.findSession(token);
      if (!session) throw authError(401, "登录已失效，请重新登录");
      return { ...session, token };
    },

    requireRole(request, roles) {
      const session = this.authenticate(request);
      if (!roles.includes(session.user.role)) throw authError(403, "当前账号没有操作权限");
      return session;
    },

    logout(request) {
      authStore.deleteSession(bearerToken(request.headers.authorization));
    }
  };
}

export function authError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function bearerToken(value) {
  const match = /^Bearer\s+(.+)$/i.exec(String(value || ""));
  return match?.[1] || "";
}
