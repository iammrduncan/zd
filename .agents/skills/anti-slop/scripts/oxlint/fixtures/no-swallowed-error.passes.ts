function a() { try { risky(); } catch (e) { logger.error("failed", e); } }
function b() { try { risky(); } catch (e) { throw new Wrapped("failed", { cause: e }); } }
function c() { try { risky(); } catch { return fallbackValue; } }
function d() { try { risky(); } catch (e) { return { ok: false, error: e }; } }
