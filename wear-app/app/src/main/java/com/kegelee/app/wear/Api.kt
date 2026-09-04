package com.kegelee.app.wear

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.TimeZone

/**
 * The same API the phone app talks to, from the watch.
 *
 * Deliberately the EXISTING endpoints and nothing new: `/auth/login`,
 * `/auth/google/token`, `/user/pull` and `/user/push` already do everything a
 * watch needs, so this app required no backend change at all. That also means
 * the server keeps exactly one idea of what an account is - a session recorded
 * here lands in the same table, dedup and all, as one recorded on the phone.
 *
 * `HttpURLConnection` rather than a client library. The whole surface is four
 * calls with JSON in and JSON out; pulling OkHttp and Retrofit into a watch
 * APK for that is weight on a device that has little to spare.
 */
object Api {
    /**
     * The versioned prefix is part of the base, not something callers add.
     *
     * Every route lives under `Route::prefix('v1')` in routes/api.php, and this
     * was pointing at `/api` - so the very first request came back "the route
     * api/auth/login could not be found" and every other endpoint would have
     * done the same. The phone builds `${base}/v1${endpoint}` for the same
     * reason; this keeps the v1 here so no call site can forget it.
     */
    private const val BASE = "https://kegelee.com/api/v1"

    /** Watches roam and radios sleep, so be patient but never indefinite. */
    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 30_000

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    sealed class Result<out T> {
        data class Ok<T>(val value: T) : Result<T>()
        /** `unauthorized` is separated because it is the one failure that must
         *  sign the watch out rather than simply be retried. */
        data class Failed(val message: String, val unauthorized: Boolean = false) : Result<Nothing>()
    }

    private fun call(
        path: String,
        method: String,
        token: String?,
        body: JsonObject?,
    ): Result<JsonObject> {
        var conn: HttpURLConnection? = null
        return runCatching {
            conn = (URL("$BASE$path").openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Content-Type", "application/json")
                /**
                 * `X-User-Token`, which is what the server actually reads.
                 *
                 * ResolveApiUser looks at that header and nothing else, so the
                 * Authorization: Bearer this used to send was ignored - every
                 * authenticated call would have come back unauthorised even
                 * once login worked. The phone sends the same header.
                 */
                token?.let { setRequestProperty("X-User-Token", it) }
                doInput = true
                if (body != null) {
                    doOutput = true
                    outputStream.use { it.write(body.toString().toByteArray()) }
                }
            }

            val live = conn!!
            val code = live.responseCode
            val text = (if (code in 200..299) live.inputStream else live.errorStream)
                ?.bufferedReader()?.use(BufferedReader::readText).orEmpty()

            /**
             * A value, not an early return.
             *
             * These were `return Result.Failed(...)` straight out of `call`,
             * which is a non-local return through the lambda - so it skipped
             * the `also` below and leaked the connection on exactly the paths
             * most likely to be hit repeatedly: an expired token retrying, a
             * server erroring on every sync.
             */
            when {
                code == 401 || code == 403 -> {
                    /**
                     * Say what the server said, not "Signed out".
                     *
                     * A 401 means two different things here. On an
                     * authenticated call it means the token is dead and the
                     * watch has to sign out; on a LOGIN it means the password
                     * was wrong, and the server sends a sentence saying exactly
                     * that. Collapsing both into "Signed out" showed somebody
                     * who mistyped their password a message about a session
                     * they never had.
                     *
                     * The `unauthorized` flag still travels, because that is
                     * what the sync path keys off - only the words change.
                     */
                    val said = runCatching {
                        (json.parseToJsonElement(text) as? JsonObject)
                            ?.get("error")?.toString()?.trim('"')
                    }.getOrNull()?.takeIf { it.isNotBlank() && it != "null" }
                    Result.Failed(said ?: "Signed out", unauthorized = true)
                }

                code !in 200..299 -> {
                    val msg = runCatching {
                        (json.parseToJsonElement(text) as? JsonObject)
                            ?.get("message")?.toString()?.trim('"')
                    }.getOrNull()?.takeIf { it.isNotBlank() && it != "null" }
                    Result.Failed(msg ?: "Request failed ($code)")
                }

                /**
                 * A 2xx that is not a JSON object is a network problem, not a
                 * bug.
                 *
                 * A captive portal, a proxy sign-in page or a WAF challenge all
                 * answer 200 with HTML. Casting it straight to JsonObject
                 * surfaced the parser's own exception text on screen, and
                 * "Unexpected JSON token at offset 0" is not something anybody
                 * can act on - it reads as the app being broken rather than the
                 * connection being intercepted.
                 */
                else -> (json.parseToJsonElement(text) as? JsonObject)
                    ?.let { Result.Ok(it) }
                    ?: Result.Failed("Couldn't reach the server. Check the watch's connection.")
            }
        }.getOrElse {
            Result.Failed(
                when (it) {
                    is java.net.UnknownHostException,
                    is java.net.ConnectException,
                    -> "No connection."
                    is java.net.SocketTimeoutException -> "The server took too long to answer."
                    // Anything the parser threw is the same hijacked-response
                    // case as above, reached by a different route.
                    is kotlinx.serialization.SerializationException,
                    is IllegalArgumentException,
                    -> "Couldn't reach the server. Check the watch's connection."
                    else -> it.message ?: "No connection."
                },
            )
        }.also {
            // In `also` rather than inline: a throw while reading the body used
            // to skip the disconnect entirely and leak the connection.
            runCatching { conn?.disconnect() }
        }
    }

    private fun timezone(): String = runCatching { TimeZone.getDefault().id }.getOrDefault("UTC")

    /** Email and password, exactly as the phone's own login does it. */
    fun login(email: String, password: String): Result<JsonObject> =
        call("/auth/login", "POST", null, buildJsonObject {
            put("email", email)
            put("password", password)
            put("timezone", timezone())
        })

    /**
     * A Google ID token from the watch's own account.
     *
     * The backend verifies the token itself and returns the same payload as a
     * password login, so nothing downstream has to care which route somebody
     * took in.
     */
    fun googleToken(idToken: String): Result<JsonObject> =
        call("/auth/google/token", "POST", null, buildJsonObject {
            put("id_token", idToken)
            put("timezone", timezone())
        })

    fun pull(token: String): Result<JsonObject> = call("/user/pull", "GET", token, null)

    /**
     * Hand finished sessions to the server.
     *
     * `client_id` is the whole reason a retry is safe: the backend keys on it,
     * so a push that succeeds but whose response is lost can be repeated
     * without recording the workout twice. Same discipline as the phone's
     * outbox, and the reason the watch can be careless about when it retries.
     */
    fun push(token: String, sessions: List<PendingSession>, levelId: Int): Result<JsonObject> =
        call("/user/push", "POST", token, buildJsonObject {
            put("timezone", timezone())
            put("level_id", levelId)
            put("workout_sessions", json.encodeToJsonElement(
                kotlinx.serialization.builtins.ListSerializer(PendingSession.serializer()),
                sessions,
            ))
        })
}

/**
 * A session finished on the watch and not yet accepted by the server.
 *
 * Field names match the phone's push payload exactly - this is the same wire
 * shape, not a watch-specific one.
 */
@Serializable
data class PendingSession(
    @SerialName("client_id") val clientId: String,
    @SerialName("exercise_slug") val exerciseSlug: String,
    @SerialName("duration_seconds") val durationSeconds: Int,
    @SerialName("completed_at_iso") val completedAtIso: String,
    @SerialName("is_extra") val isExtra: Boolean = false,
)
