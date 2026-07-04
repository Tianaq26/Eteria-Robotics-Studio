// ======================================================
// Sumobot — C++ (Arduino / ESP32) · CÓDIGO DE EJEMPLO
// Este código corre en el ROBOT REAL. El simulador no ejecuta C++:
// usa el botón "Descargar .ino" y súbelo con Arduino IDE o PlatformIO.
// Documentación oficial: https://docs.arduino.cc/language-reference/
// ======================================================

// ======================================================
// LIBRERIAS
// ======================================================
#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include <Ultrasonic.h>

#pragma region CONFIGURACION_GLOBAL
// ======================================================
// CONFIGURACION GLOBAL
// ======================================================
// Todas las constantes de tiempo son unsigned long para evitar
// conversiones implicitas con millis() y desbordamiento en restas.

// ==========================
// Maniobras de inicio
// ==========================

const unsigned long TIEMPO_GIRO_180 = 600;
const unsigned long TIEMPO_GIRO_90 = 300;
const unsigned long TIMEOUT_SELECCION = 400;
const unsigned long TIEMPO_HOLD_FRENTE = 800;
const unsigned long TIEMPO_ATAQUE_TRASERO = 2000;
const unsigned long TIEMPO_DASH_INICIAL = 600;
const unsigned long TIEMPO_REBOTE_ESPALDAS = 350;

// ==========================
// Escape inteligente
// ==========================

// Velocidades del gancho: rueda rapida y rueda lenta.
const float GANCHO_RAPIDA = 1.0f;
const float GANCHO_LENTA  = -0.15f; // leve contraimpulso interior: arco amplio y fluido, no trompo
// Paso de rampa (slew-rate) por ciclo (~10 ms): suaviza los cambios de
// velocidad del gancho para que las transiciones no se sientan "pegadas".
const float GANCHO_PASO_RAMPA = 0.12f;
// Cierre del gancho (Fase 3): giro rodando hacia adelante para reencarar el
// borde sin frenar en seco (antes era un trompo en el sitio que se sentia trabado).
const float GANCHO_CIERRE_INT = 0.20f; // rueda interior del cierre
const float GANCHO_CIERRE_EXT = 1.0f;  // rueda exterior del cierre
// Burst frontal si el rival empuja por detras durante el avance de Fase 2.
const unsigned long TIEMPO_EMPUJE_RIVAL = 500;

// Giro agresivo inicial del gancho: contraimpulso explosivo antes de la curva.
const unsigned long TIEMPO_GANCHO_SPRINT = 160; // contrarotacion inicial
const unsigned long TIEMPO_GANCHO_BURST = 220;  // impulso de salida post-sprint

// Cierre del gancho (Fase 3). Mas largo que el viejo trompo porque el giro
// rodado gira mas despacio por vuelta, pero se ve mucho mas fluido.
const unsigned long TIEMPO_GANCHO_PIVOTE = 360;

// Tiempo de avance hacia el centro (Fase 2 del gancho).
const unsigned long TIEMPO_LOOP_CONTRAATAQUE = 900;
const unsigned long TIEMPO_ESCAPE_FRONTAL = 300;

// Cooldown minimo entre cambios de lado de gancho (izq→der o der→izq).
const unsigned long COOLDOWN_GANCHO = 2000;

// Timeout de escape por ambos lados. Si el robot lleva este tiempo sin salir
// de la linea blanca por ambos lados, el rival lo esta empujando: contraataque.
const unsigned long TIMEOUT_ESCAPE_AMBOS = 1200;
const unsigned long TIMEOUT_ESCAPE_GANCHO = 5000;

// ==========================
// Busqueda con memoria de contacto
// ==========================

const unsigned long TIEMPO_MEMORIA_VALIDA = 1200;
const unsigned long TIEMPO_RASTREO = 1000;

// ==========================
// Hardware — NeoPixel
// ==========================

#define LED_PIN 2
#define NUM_LEDS 1
Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

// ==========================
// Hardware — Boton BOOT (activo LOW)
// ==========================

#define BOOT_PIN 0

// ==========================
// Hardware — Ultrasonico
// ==========================

#define TRIG_PIN 25
#define ECHO_PIN 26
Ultrasonic sonar(TRIG_PIN, ECHO_PIN);

// ==========================
// Hardware — Sensores IR
// ==========================

#define IR_FL 36
#define IR_FR 39
#define IR_BL 34
#define IR_BR 35

// ==========================
// Hardware — Motores
// ==========================

const int motorA_IN1 = 12;
const int motorA_IN2 = 14;
const int motorB_IN1 = 13;
const int motorB_IN2 = 15;

// ==========================
// Configuracion IA
// ==========================

const int DIST_ATAQUE = 50;
const int DIST_PERDIDA = 60;
const int IR_UMBRAL = 100;

// Empuje continuo antes de hacer un juke (anti-deadlock).
const unsigned long TIEMPO_STALL = 15000;

const float balanceMotorDerecho = 1.0f;
const float balanceMotorIzquierdo = 1.0f;
const bool invertMotor1 = true;
const bool invertMotor2 = true;

// ==========================
// Estado de combate global
// ==========================

bool maniobraInicial = true;
bool izquierda = true;

// Escape
int tipoEscapeActual = 0;
unsigned long tiempoInicioEscapeTipo = 0;
bool escapeDesdeAtaque = false;

// Cooldown de cambio de lado de gancho
int ultimoLadoGancho = 0;
unsigned long tiempoFinUltimoGancho = 0;

// Memoria del ultimo contacto con el rival
bool memoriaContactoValida = false;
bool giroAlContacto = true;
unsigned long momentoUltimoContacto = 0;
unsigned long momentoInicioRastreo = 0;

// Ataque: cronometro de inicio (usado para deteccion dudosa y anti-deadlock)
unsigned long momentoInicioAtaque = 0;
bool jukeIzquierda = false;

// Prediccion de movimiento del rival
// velocidadRival > 0: rival alejandose; < 0: rival acercandose (cm/s)
float distanciaPrevia = 999.0f;
unsigned long momentoDistanciaPrevia = 0;
float velocidadRival = 0.0f;

// Histéresis de pérdida de contacto: requiere N ticks consecutivos sin rival
// para abandonar ATACAR, evitando salidas espurias por lecturas ruidosas.
int ticksSinContacto = 0;
const int TICKS_HISTERESIS_PERDIDA = 3;

// Deteccion de rebote contra el dojo:
// Si el ultimo escape fue provocado desde ATACAR (escapeDesdeAtaque=true),
// el proximo ATACAR hara un giro 180 en lugar de embestir en la misma direccion.
// No hay limite de tiempo: cualquier ciclo ATACAR->ESCAPAR->ATACAR lo activa.
unsigned long momentoSalidaEscape = 0; // ultimo millis en que el borde se libero
bool escapePrevioDesdeAtaque = false;  // el ultimo escape fue disparado desde ATACAR
bool giro180PostEscape = false;        // flag: ejecutar 180 al inicio del proximo ATACAR

#pragma endregion

#pragma region ESTADOS
// ======================================================
// ESTADOS
// ======================================================

enum Estado
{
    ESPERA,
    BUSCAR,
    RASTREAR,
    ATACAR,
    ESCAPAR
};

enum Posicion
{
    ESPALDAS = 1,
    DE_LADO = 2,
    DE_FRENTE = 3
};

// B_ARCO: avanza en curva barriendo el cono del ultrasonico mientras se mueve.
// B_RECTO: avance recto para cambiar de zona.
enum FaseBuscar
{
    B_ARCO,
    B_RECTO
};

Estado estado = ESPERA;
Posicion posicion = ESPALDAS;

FaseBuscar faseBuscar = B_ARCO;
unsigned long inicioFaseBuscar = 0;
unsigned long duracionFaseBuscar = 0;
unsigned long tiempoSinContactoBuscar = 0;

#pragma endregion

#pragma region FUNCIONES_LED
// ======================================================
// FUNCIONES LED
// ======================================================

void setColor(uint8_t r, uint8_t g, uint8_t b)
{
    strip.setPixelColor(0, strip.Color(r, g, b));
    strip.show();
}

void apagarLed() { setColor(0, 0, 0); }

// Color actualmente mostrado (para detectar cambios de fase).
static uint32_t _colorActual = 0;

// Destello verde brevísimo al cambiar de fase. Los motores siguen corriendo
// durante los 8ms del flash — no interfiere con el movimiento del robot.
// Solo destella si el color realmente cambia, así no parpadea en cada tick.
void setFase(uint8_t r, uint8_t g, uint8_t b)
{
    uint32_t nuevo = strip.Color(r, g, b);
    if (nuevo != _colorActual)
    {
        _colorActual = nuevo;
        setColor(0, 60, 0); // destello verde tenue
        delay(8);
        setColor(r, g, b);
    }
}

void mostrarPosicion(Posicion p)
{
    if (p == ESPALDAS)
        setColor(255, 0, 100);
    else if (p == DE_LADO)
        setColor(0, 0, 255);
    else
        setColor(0, 255, 0);
}

void parpadearConfirmacion(Posicion p)
{
    for (int i = 0; i < 4; i++)
    {
        mostrarPosicion(p);
        delay(60);
        apagarLed();
        delay(60);
    }
    mostrarPosicion(p);
}

#pragma endregion

#pragma region MOTORES
// ======================================================
// FUNCIONES MOTORES
// ======================================================

inline int pwm(float v) { return (int)(v * 255.0f); }

static void setMotor(int pinA, int pinB, float s)
{
    s = constrain(s, -1.0f, 1.0f);
    if (s > 0.0f)
    {
        analogWrite(pinA, pwm(s));
        analogWrite(pinB, 0);
    }
    else if (s < 0.0f)
    {
        analogWrite(pinA, 0);
        analogWrite(pinB, pwm(-s));
    }
    else
    {
        analogWrite(pinA, 0);
        analogWrite(pinB, 0);
    }
}

// Ultima velocidad logica (-1..1) realmente comandada a cada rueda. La usa
// motoresRampa() para interpolar suave desde donde sea que venia el robot,
// sin importar quien hizo la ultima llamada.
float velComandada1 = 0.0f;
float velComandada2 = 0.0f;

void motores(float motor1v, float motor2v)
{
    velComandada1 = constrain(motor1v, -1.0f, 1.0f);
    velComandada2 = constrain(motor2v, -1.0f, 1.0f);
    float m1 = invertMotor1 ? -motor1v : motor1v;
    float m2 = invertMotor2 ? -motor2v : motor2v;
    setMotor(motorA_IN1, motorA_IN2, m1 * balanceMotorDerecho);
    setMotor(motorB_IN1, motorB_IN2, m2 * balanceMotorIzquierdo);
}

void detenerMotores() { motores(0.0f, 0.0f); }

// Acerca 'actual' a 'objetivo' un paso maximo (limite de aceleracion por ciclo).
static inline float aproximarVel(float actual, float objetivo, float paso)
{
    if (objetivo > actual)
        return (actual + paso > objetivo) ? objetivo : actual + paso;
    if (objetivo < actual)
        return (actual - paso < objetivo) ? objetivo : actual - paso;
    return actual;
}

// Como motores(), pero rampea desde la ultima velocidad comandada hacia el
// objetivo en vez de saltar de golpe. Llamar repetidamente (cada ~10 ms) dentro
// de un bucle para una transicion fluida; elimina el tiron de "rueda que invierte
// instantaneamente" que hace sentir el giro trabado.
void motoresRampa(float obj1, float obj2, float paso)
{
    motores(aproximarVel(velComandada1, obj1, paso),
            aproximarVel(velComandada2, obj2, paso));
}

#pragma endregion

#pragma region SENSORES
// ======================================================
// SENSORES
// ======================================================

float leerDistancia()
{
    float d = sonar.read();
    // d <= 0 significa que el rival esta demasiado cerca para el sonar (punto ciego).
    // Tratarlo como contacto directo (2 cm) en lugar de "perdido" (999).
    if (d <= 0.0f)
        return 2.0f;
    if (d > 400.0f)
        return 999.0f;
    return d;
}

enum IndiceSensorIR
{
    SENSOR_FL = 0,
    SENSOR_FR = 1,
    SENSOR_BL = 2,
    SENSOR_BR = 3
};

struct SensorIR
{
    int pin;
    bool activo;
};

SensorIR sensoresIR[4] = {
    {IR_FL, false},
    {IR_FR, false},
    {IR_BL, false},
    {IR_BR, false}};

void leerSensoresIR()
{
    for (int i = 0; i < 4; i++)
        sensoresIR[i].activo = analogRead(sensoresIR[i].pin) < IR_UMBRAL;
}

bool hayBorde()
{
    for (int i = 0; i < 4; i++)
        if (sensoresIR[i].activo)
            return true;
    return false;
}

bool ladoIzquierdoActivo() { return sensoresIR[SENSOR_FL].activo || sensoresIR[SENSOR_BL].activo; }
bool ladoDerechoActivo() { return sensoresIR[SENSOR_FR].activo || sensoresIR[SENSOR_BR].activo; }

bool detectarBorde()
{
    leerSensoresIR();
    return hayBorde();
}

// Confirmacion con doble lectura inmediata: elimina falsos positivos sin delay.
bool confirmarBorde()
{
    leerSensoresIR();
    if (!hayBorde())
        return false;
    leerSensoresIR();
    return hayBorde();
}

#pragma endregion

#pragma region ESCAPE_INTELIGENTE
// ======================================================
// ESCAPE INTELIGENTE
// ======================================================
// Matriz de prioridad:
//   1. escapeDesdeAtaque      → retroceso recto hasta liberar la linea
//   2. izq && der             → retrocede recto (timeout → contraataque forzado)
//   3. solo izq (FL/BL/FL+BL) → gancho izquierdo (Fase 0 sprint + 1 curva + 2 centro + 3 pivote)
//   4. solo der (FR/BR/FR+BR) → gancho derecho   (espejo)
//
// Sin parpadeoFase entre fases: continuidad total de movimiento.
// El LED cambia instantaneamente al inicio de cada fase.
// Los delay(70) al final son solo para estabilizar la parada fisica.

void ejecutarContraataqueForzado()
{
    // 1. Retroceso explosivo para alejarse del borde antes de girar
    setFase(255, 0, 200); // magenta: contraataque forzado
    motores(-1.0f, -1.0f);
    unsigned long tRetro = millis();
    while (millis() - tRetro < 250)
    {
        leerSensoresIR();
        if (!hayBorde())
            break;
        delay(10);
        yield();
    }

    // 2. Giro 180 alternando lado (jukeIzquierda) — no aleatorio para ser predecible
    motores(jukeIzquierda ? -1.0f : 1.0f, jukeIzquierda ? 1.0f : -1.0f);
    jukeIzquierda = !jukeIzquierda;
    unsigned long tGiro = millis();
    while (millis() - tGiro < TIEMPO_GIRO_180)
    {
        leerSensoresIR();
        if (hayBorde())
            break; // borde durante el giro: salir y dejar que escaparInteligente tome el control
        delay(10);
        yield();
    }

    // 3. Embestida agresiva de reingreso
    setFase(255, 0, 0); // rojo: reembiste
    motores(1.0f, 1.0f);
    unsigned long tRam = millis();
    while (millis() - tRam < 1000)
    {
        leerSensoresIR();
        if (hayBorde())
            break;
        delay(10);
        yield();
    }

    // Transicionar a ATACAR para mantener la presion sobre el rival
    estado = ATACAR;
    momentoInicioAtaque = millis();
    detenerMotores();
}

void escaparInteligente()
{
    bool desdeAtaque = escapeDesdeAtaque;
    escapeDesdeAtaque = false;

    leerSensoresIR();
    bool izq = ladoIzquierdoActivo();
    bool der = ladoDerechoActivo();

    if (!izq && !der)
        return;

    // ── Escape desde ATACAR ───────────────────────────────────────────
    if (desdeAtaque)
    {
        bool frenteCompleto = sensoresIR[SENSOR_FL].activo && sensoresIR[SENSOR_FR].activo;

        if (frenteCompleto)
        {
            // Ambos sensores frontales al atacar: borde del dojo, no el rival.
            // Retroceso + giro 180 para re-encarar al centro.
            setFase(255, 0, 200); // magenta: retroceso post-borde
            unsigned long tRetro = millis();
            while (millis() - tRetro < 400)
            {
                leerSensoresIR();
                if (!hayBorde())
                    break;
                motores(-1.0f, -1.0f);
                delay(10);
                yield();
            }
            motores(jukeIzquierda ? -1.0f : 1.0f, jukeIzquierda ? 1.0f : -1.0f);
            jukeIzquierda = !jukeIzquierda;
            unsigned long tGiro = millis();
            while (millis() - tGiro < TIEMPO_GIRO_180)
            {
                leerSensoresIR();
                if (hayBorde())
                    break;
                delay(10);
                yield();
            }
            detenerMotores();
            return;
        }

        // Borde parcial o lateral al atacar: retroceso recto.
        setFase(255, 60, 0); // naranja-rojo: retroceso lateral
        unsigned long safety = millis();
        while (millis() - safety < 3000)
        {
            leerSensoresIR();
            if (!hayBorde())
                break;
            motores(-1.0f, -1.0f);
            delay(10);
            yield();
        }
        detenerMotores();
        return;
    }

    // ── Tracking de tiempo por tipo de escape ─────────────────────────
    int tipoActual = (izq && der) ? 1 : (izq ? 2 : 3);

    if (tipoActual >= 2 && ultimoLadoGancho >= 2 && tipoActual != ultimoLadoGancho)
    {
        if (millis() - tiempoFinUltimoGancho < COOLDOWN_GANCHO)
            tipoActual = 1;
    }

    if (tipoActual != tipoEscapeActual)
    {
        tipoEscapeActual = tipoActual;
        tiempoInicioEscapeTipo = millis();
    }
    unsigned long tiempoEnTipo = millis() - tiempoInicioEscapeTipo;

    // ── Ambos lados activos → retrocede recto ────────────────────────
    if (izq && der)
    {
        if (tiempoEnTipo >= TIMEOUT_ESCAPE_AMBOS)
        {
            tipoEscapeActual = 0;
            ejecutarContraataqueForzado();
            return;
        }

        setFase(255, 0, 0); // rojo: peligro maximo, ambos lados
        unsigned long inicio = millis();
        while (millis() - inicio < TIEMPO_ESCAPE_FRONTAL)
        {
            leerSensoresIR();
            if (!hayBorde())
                break;
            motores(-1.0f, -1.0f);
            delay(10);
            yield();
        }
        detenerMotores();
        return;
    }

    // ── Gancho izquierdo (FL, BL o FL+BL) ────────────────────────────
    if (izq)
    {
        if (tiempoEnTipo >= TIMEOUT_ESCAPE_GANCHO)
        {
            tipoEscapeActual = 0;
            detenerMotores();
            return;
        }

        // Fase 0: sprint — contrarotacion explosiva para despegarse de golpe
        setFase(255, 255, 0); // amarillo puro
        unsigned long t0 = millis();
        while (millis() - t0 < TIEMPO_GANCHO_SPRINT)
        {
            leerSensoresIR();
            if (!ladoIzquierdoActivo())
                break;
            motores(1.0f, -1.0f);
            delay(10);
            yield();
        }
        // Burst: impulso rapido de salida para aprovechar la inercia del sprint
        {
            unsigned long tb = millis();
            while (millis() - tb < TIEMPO_GANCHO_BURST)
            {
                leerSensoresIR();
                if (hayBorde())
                    break;
                motoresRampa(GANCHO_RAPIDA, GANCHO_LENTA, GANCHO_PASO_RAMPA);
                delay(10);
                yield();
            }
        }

        // Fase 1: curva hasta liberar sensores izquierdos
        setFase(200, 255, 0); // amarillo-verde
        bool salio = false;
        unsigned long safety = millis();
        while (millis() - safety < 2000)
        {
            leerSensoresIR();
            if (!ladoIzquierdoActivo())
            {
                salio = true;
                break;
            }
            motoresRampa(GANCHO_RAPIDA, GANCHO_LENTA, GANCHO_PASO_RAMPA);
            delay(10);
            yield();
        }
        if (!salio)
        {
            motores(-1.0f, -1.0f);
            delay(300);
            detenerMotores();
            tiempoFinUltimoGancho = millis();
            ultimoLadoGancho = 2;
            return;
        }

        // Fase 2: avance agresivo al centro con arco pronunciado hacia adelante.
        // Si sensores traseros se activan el rival esta empujando: burst frontal.
        setFase(255, 220, 0); // amarillo-naranja
        unsigned long t2 = millis();
        while (millis() - t2 < TIEMPO_LOOP_CONTRAATAQUE)
        {
            leerSensoresIR();
            if (hayBorde())
            {
                // Solo el frente/lado libre — si es trasero puede ser empuje
                bool soloTrasero = (sensoresIR[SENSOR_BL].activo || sensoresIR[SENSOR_BR].activo)
                                && !sensoresIR[SENSOR_FL].activo && !sensoresIR[SENSOR_FR].activo;
                if (soloTrasero)
                {
                    // Rival empujando desde atras: burst frontal a tope para arrastrarlo
                    setFase(255, 80, 0); // naranja: contraempuje
                    motores(1.0f, 1.0f);
                    unsigned long tEmp = millis();
                    while (millis() - tEmp < TIEMPO_EMPUJE_RIVAL)
                    {
                        leerSensoresIR();
                        if (sensoresIR[SENSOR_FL].activo || sensoresIR[SENSOR_FR].activo)
                            break; // frente toca borde: parar burst
                        delay(10);
                        yield();
                    }
                    setFase(255, 220, 0);
                    continue; // retomar avance normal
                }
                tiempoFinUltimoGancho = millis();
                ultimoLadoGancho = 2;
                return;
            }
            if (leerDistancia() < DIST_ATAQUE)
            {
                tiempoFinUltimoGancho = millis();
                ultimoLadoGancho = 2;
                estado = ATACAR;
                momentoInicioAtaque = millis();
                return;
            }
            motoresRampa(GANCHO_RAPIDA, GANCHO_LENTA, GANCHO_PASO_RAMPA);
            delay(10);
            yield();
        }

        // Fase 3: cierre rodado — gira hacia adelante para reencarar el borde
        // sin frenar en seco (la rampa entra suave desde el arco de la Fase 2).
        setFase(255, 255, 80); // amarillo claro
        unsigned long t3 = millis();
        while (millis() - t3 < TIEMPO_GANCHO_PIVOTE)
        {
            leerSensoresIR();
            if (hayBorde())
            {
                tiempoFinUltimoGancho = millis();
                ultimoLadoGancho = 2;
                return;
            }
            if (leerDistancia() < DIST_ATAQUE)
            {
                tiempoFinUltimoGancho = millis();
                ultimoLadoGancho = 2;
                estado = ATACAR;
                momentoInicioAtaque = millis();
                return;
            }
            motoresRampa(GANCHO_CIERRE_INT, GANCHO_CIERRE_EXT, GANCHO_PASO_RAMPA);
            delay(10);
            yield();
        }

        detenerMotores();
        tiempoFinUltimoGancho = millis();
        ultimoLadoGancho = 2;
        return;
    }

    // ── Gancho derecho (FR, BR o FR+BR) ──────────────────────────────
    if (tiempoEnTipo >= TIMEOUT_ESCAPE_GANCHO)
    {
        tipoEscapeActual = 0;
        detenerMotores();
        return;
    }

    // Fase 0: sprint — contrarotacion explosiva para despegarse de golpe
    setFase(0, 255, 255); // cyan puro
    unsigned long t0 = millis();
    while (millis() - t0 < TIEMPO_GANCHO_SPRINT)
    {
        leerSensoresIR();
        if (!ladoDerechoActivo())
            break;
        motores(-1.0f, 1.0f);
        delay(10);
        yield();
    }
    // Burst: impulso rapido de salida para aprovechar la inercia del sprint
    {
        unsigned long tb = millis();
        while (millis() - tb < TIEMPO_GANCHO_BURST)
        {
            leerSensoresIR();
            if (hayBorde())
                break;
            motoresRampa(GANCHO_LENTA, GANCHO_RAPIDA, GANCHO_PASO_RAMPA);
            delay(10);
            yield();
        }
    }

    // Fase 1: curva hasta liberar sensores derechos
    setFase(0, 200, 255); // cyan-azul
    bool salio = false;
    unsigned long safety = millis();
    while (millis() - safety < 2000)
    {
        leerSensoresIR();
        if (!ladoDerechoActivo())
        {
            salio = true;
            break;
        }
        motoresRampa(GANCHO_LENTA, GANCHO_RAPIDA, GANCHO_PASO_RAMPA);
        delay(10);
        yield();
    }
    if (!salio)
    {
        motores(-1.0f, -1.0f);
        delay(300);
        detenerMotores();
        tiempoFinUltimoGancho = millis();
        ultimoLadoGancho = 3;
        return;
    }

    // Fase 2: avance agresivo al centro con arco pronunciado hacia adelante.
    // Si sensores traseros se activan el rival esta empujando: burst frontal.
    setFase(0, 255, 180); // cyan-verde
    unsigned long t2 = millis();
    while (millis() - t2 < TIEMPO_LOOP_CONTRAATAQUE)
    {
        leerSensoresIR();
        if (hayBorde())
        {
            bool soloTrasero = (sensoresIR[SENSOR_BL].activo || sensoresIR[SENSOR_BR].activo)
                            && !sensoresIR[SENSOR_FL].activo && !sensoresIR[SENSOR_FR].activo;
            if (soloTrasero)
            {
                setFase(0, 180, 80); // verde-cyan: contraempuje
                motores(1.0f, 1.0f);
                unsigned long tEmp = millis();
                while (millis() - tEmp < TIEMPO_EMPUJE_RIVAL)
                {
                    leerSensoresIR();
                    if (sensoresIR[SENSOR_FL].activo || sensoresIR[SENSOR_FR].activo)
                        break;
                    delay(10);
                    yield();
                }
                setFase(0, 255, 180);
                continue;
            }
            tiempoFinUltimoGancho = millis();
            ultimoLadoGancho = 3;
            return;
        }
        if (leerDistancia() < DIST_ATAQUE)
        {
            tiempoFinUltimoGancho = millis();
            ultimoLadoGancho = 3;
            estado = ATACAR;
            momentoInicioAtaque = millis();
            return;
        }
        motoresRampa(GANCHO_LENTA, GANCHO_RAPIDA, GANCHO_PASO_RAMPA);
        delay(10);
        yield();
    }

    // Fase 3: cierre rodado — gira hacia adelante para reencarar el borde
    // sin frenar en seco (la rampa entra suave desde el arco de la Fase 2).
    setFase(100, 255, 255); // cyan claro
    unsigned long t3 = millis();
    while (millis() - t3 < TIEMPO_GANCHO_PIVOTE)
    {
        leerSensoresIR();
        if (hayBorde())
        {
            tiempoFinUltimoGancho = millis();
            ultimoLadoGancho = 3;
            return;
        }
        if (leerDistancia() < DIST_ATAQUE)
        {
            tiempoFinUltimoGancho = millis();
            ultimoLadoGancho = 3;
            estado = ATACAR;
            momentoInicioAtaque = millis();
            return;
        }
        motoresRampa(GANCHO_CIERRE_INT, GANCHO_CIERRE_EXT, GANCHO_PASO_RAMPA);
        delay(10);
        yield();
    }

    detenerMotores();
    tiempoFinUltimoGancho = millis();
    ultimoLadoGancho = 3;
}

#pragma endregion

#pragma region TACTICAS_ATAQUE
// ======================================================
// TACTICAS DE ATAQUE
// ======================================================

// Juke anti-deadlock: si el empuje frontal se estanca TIEMPO_STALL ms,
// retrocede, cambia de angulo y reembiste para entrar desde otra direccion.
void jukeAtaque()
{
    setFase(180, 0, 80); // rojo-magenta: juke anti-deadlock

    // 1. Retroceso explosivo con leve diferencial para romper el agarre
    bool jDir = jukeIzquierda;
    motores(jDir ? -0.7f : -1.0f, jDir ? -1.0f : -0.7f);
    unsigned long t = millis();
    while (millis() - t < 100)
    {
        if (detectarBorde())
        {
            detenerMotores();
            return;
        }
        delay(10);
        yield();
    }

    // 2. Pivote maximo: contrarotacion completa (-1/1) para maximo angulo
    if (jukeIzquierda)
        motores(-1.0f, 1.0f);
    else
        motores(1.0f, -1.0f);
    jukeIzquierda = !jukeIzquierda;

    t = millis();
    while (millis() - t < 120)
    {
        if (detectarBorde())
        {
            detenerMotores();
            return;
        }
        delay(10);
        yield();
    }

    // 3. Reembiste a tope desde el nuevo angulo
    motores(1.0f, 1.0f);
    t = millis();
    while (millis() - t < 150)
    {
        if (detectarBorde())
        {
            detenerMotores();
            return;
        }
        delay(10);
        yield();
    }
}

#pragma endregion

#pragma region INICIO
// ======================================================
// FLUJO DE INICIO
// ======================================================

bool esperarToque(unsigned long timeoutMs)
{
    unsigned long inicio = millis();
    while (millis() - inicio < timeoutMs)
    {
        if (digitalRead(BOOT_PIN) == LOW)
        {
            delay(40);
            if (digitalRead(BOOT_PIN) == LOW)
            {
                while (digitalRead(BOOT_PIN) == LOW)
                    delay(10);
                return true;
            }
        }
        delay(5);
    }
    return false;
}

void esperarBoton()
{
    while (digitalRead(BOOT_PIN) == LOW)
        delay(10);

    unsigned long ultimoParpadeo = 0;
    bool ledEncendido = false;
    unsigned long inicioPresion = 0;

    while (true)
    {
        if (digitalRead(BOOT_PIN) == LOW)
        {
            delay(40);
            if (digitalRead(BOOT_PIN) == LOW)
            {
                inicioPresion = millis();
                while (digitalRead(BOOT_PIN) == LOW)
                {
                    if (millis() - inicioPresion >= TIEMPO_HOLD_FRENTE)
                        setColor(0, 255, 0);
                    delay(10);
                }
                break;
            }
        }
        if (millis() - ultimoParpadeo > 400)
        {
            ultimoParpadeo = millis();
            ledEncendido = !ledEncendido;
            ledEncendido ? setColor(0, 10, 10) : apagarLed();
        }
    }

    unsigned long duracion = millis() - inicioPresion;
    apagarLed();

    if (duracion >= TIEMPO_HOLD_FRENTE)
    {
        posicion = DE_FRENTE;
    }
    else
    {
        mostrarPosicion(ESPALDAS);
        bool huboToque = esperarToque(TIMEOUT_SELECCION);
        posicion = huboToque ? DE_LADO : ESPALDAS;
        if (huboToque)
            mostrarPosicion(DE_LADO);
    }

    parpadearConfirmacion(posicion);
    estado = BUSCAR;
}

#pragma endregion

#pragma region IA_PRINCIPAL
// ======================================================
// IA PRINCIPAL
// ======================================================

void MainIA()
{
    // ==================================================
    // Maniobra de inicio (ejecuta una sola vez al arrancar)
    // ==================================================

    if (maniobraInicial)
    {
        maniobraInicial = false;

        if (posicion == ESPALDAS)
        {
            setColor(255, 0, 100);
            bool tocoBorde = false;
            unsigned long inicio = millis();
            while (millis() - inicio < TIEMPO_ATAQUE_TRASERO)
            {
                leerSensoresIR();
                if (hayBorde())
                {
                    tocoBorde = true;
                    break;
                }
                motores(-1.0f, -1.0f);
                delay(10);
                yield();
            }
            detenerMotores();
            delay(20);

            if (tocoBorde)
            {
                setColor(0, 180, 0);
                unsigned long tAvance = millis();
                while (millis() - tAvance < TIEMPO_REBOTE_ESPALDAS)
                {
                    motores(1.0f, 1.0f);
                    delay(10);
                    yield();
                }
                detenerMotores();
            }
            else
            {
                motores(-1.0f, 1.0f);
                delay(TIEMPO_GIRO_180);
                detenerMotores();
            }
        }
        else if (posicion == DE_LADO)
        {
            setColor(0, 0, 255);
            motores(-1.0f, 1.0f);
            delay(TIEMPO_GIRO_90);
            detenerMotores();
        }
        else // DE_FRENTE
        {
            setColor(0, 255, 0);
            unsigned long inicio = millis();
            while (millis() - inicio < TIEMPO_DASH_INICIAL)
            {
                if (detectarBorde())
                    break;
                motores(1.0f, 1.0f);
                delay(10);
                yield();
            }
            detenerMotores();
        }
    }

    // ==================================================
    // Sensores y transicion de estados
    // Prioridad: ESCAPAR > ATACAR > RASTREAR > BUSCAR
    //
    // Se evalua el borde PRIMERO (IR, barato) antes del ping ultrasonico.
    // Si hay borde, no se pinga el sonar: la linea blanca siempre gana.
    // ==================================================

    bool borde = confirmarBorde();

    if (borde)
    {
        bool vieneDeataque = (estado == ATACAR);
        escapeDesdeAtaque = vieneDeataque;
        if (vieneDeataque)
            escapePrevioDesdeAtaque = true;
        // tipoEscapeActual NO se resetea aqui para que el cronometro
        // acumule correctamente mientras estemos sobre la linea.
        estado = ESCAPAR;
    }
    else
    {
        // Si veniamos de ESCAPAR y el borde acaba de liberarse, registrar el momento.
        if (estado == ESCAPAR)
            momentoSalidaEscape = millis();

        tipoEscapeActual = 0;

        float distancia = leerDistancia();

        // Calcular velocidad del rival (cm/s). Positivo = se aleja, negativo = se acerca.
        // Solo se actualiza con lecturas validas y con al menos 20ms entre ellas.
        unsigned long ahoraMs = millis();
        if (momentoDistanciaPrevia > 0 && distancia < 400.0f && distanciaPrevia < 400.0f)
        {
            float dt = (ahoraMs - momentoDistanciaPrevia) / 1000.0f;
            if (dt >= 0.02f)
            {
                velocidadRival = (distancia - distanciaPrevia) / dt;
                distanciaPrevia = distancia;
                momentoDistanciaPrevia = ahoraMs;
            }
        }
        else
        {
            distanciaPrevia = distancia;
            momentoDistanciaPrevia = ahoraMs;
        }

        // Histeresis de umbral: entra a ATACAR a DIST_ATAQUE, sale a DIST_PERDIDA.
        int umbral = (estado == ATACAR) ? DIST_PERDIDA : DIST_ATAQUE;

        if (distancia < umbral)
        {
            ticksSinContacto = 0;
            if (estado != ATACAR)
            {
                memoriaContactoValida = true;
                giroAlContacto = (velocidadRival > 15.0f) ? !izquierda : izquierda;
                momentoInicioAtaque = millis();

                // Si el ultimo escape fue disparado desde ATACAR, el robot
                // reboto contra el borde del dojo. Borrar memoria de contacto
                // para no perseguir un objeto que esta fuera del dojo,
                // y programar giro 180 para no embestir en la misma direccion.
                giro180PostEscape = escapePrevioDesdeAtaque;
                if (escapePrevioDesdeAtaque)
                {
                    memoriaContactoValida = false;
                    momentoUltimoContacto = 0;
                }
                escapePrevioDesdeAtaque = false;
            }
            momentoUltimoContacto = millis();
            estado = ATACAR;
        }
        else
        {
            // Histéresis de pérdida: ignorar hasta TICKS_HISTERESIS_PERDIDA lecturas
            // consecutivas sin contacto antes de abandonar ATACAR.
            if (estado == ATACAR)
            {
                ticksSinContacto++;
                if (ticksSinContacto < TICKS_HISTERESIS_PERDIDA)
                {
                    // Mantener ATACAR: el rival probablemente sigue ahi.
                    motores(1.0f, 1.0f);
                    return;
                }
                // Perdida confirmada: ajustar direccion de rastreo segun velocidad.
                // Si el rival se alejaba rapido, buscar al lado opuesto del arco.
                if (velocidadRival > 20.0f)
                    giroAlContacto = !izquierda;
            }
            ticksSinContacto = 0;

            // El robot ya no esta en contexto de ataque: limpiar flag de rebote.
            escapePrevioDesdeAtaque = false;

            bool memoriaReciente = memoriaContactoValida &&
                                   (millis() - momentoUltimoContacto < TIEMPO_MEMORIA_VALIDA);
            if (memoriaReciente)
            {
                if (estado != RASTREAR)
                    momentoInicioRastreo = millis();
                estado = RASTREAR;
            }
            else
            {
                memoriaContactoValida = false;
                if (estado != BUSCAR) tiempoSinContactoBuscar = millis();
                estado = BUSCAR;
            }
        }
    }

    // ==================================================
    // BUSCAR — avance con barrido oscilante.
    //
    // Ambas ruedas siempre positivas (avance constante). Se alterna cual
    // rueda va a tope (1.0) y cual va lenta (0.15-0.35) para generar un
    // desvio lateral suave que barre el cono del ultrasonico de lado a lado.
    // Duracion aleatoria por semiciclo para patron no periodico.
    //
    // Cada 2 s sin detectar rival: pivote bloqueante de 90°.
    // ==================================================

    if (estado == BUSCAR)
    {
        setFase(0, 0, 255); // azul: buscando
        unsigned long ahora = millis();

        // Pivote de reorientacion cada 2 s sin contacto
        if (ahora - tiempoSinContactoBuscar >= 2000)
        {
            setFase(0, 100, 255); // azul claro: pivote 90°
            motores(izquierda ? -1.0f : 1.0f, izquierda ? 1.0f : -1.0f);
            izquierda = !izquierda;
            unsigned long tPivote = millis();
            while (millis() - tPivote < TIEMPO_GIRO_90)
            {
                delay(10);
                yield();
            }
            detenerMotores();
            tiempoSinContactoBuscar = millis();
            inicioFaseBuscar = millis();
            duracionFaseBuscar = random(250, 450);
            setFase(0, 0, 255);
            return;
        }

        // Cambio de lado al completar el semiciclo
        if (ahora - inicioFaseBuscar >= duracionFaseBuscar)
        {
            izquierda = !izquierda;
            duracionFaseBuscar = random(250, 450);
            inicioFaseBuscar = ahora;
        }

        // Avance con desvio: rueda rapida a tope, rueda lenta positiva
        float vLenta = random(15, 36) / 100.0f; // 0.15-0.35, siempre avanza
        if (izquierda)
            motores(1.0f, vLenta);
        else
            motores(vLenta, 1.0f);
    }

    // ==================================================
    // RASTREAR — busqueda dirigida con memoria de contacto.
    //
    // La velocidad del rival ajusta el comportamiento:
    //   vel > 20 cm/s (huyendo rapido): giro agresivo 1.0/-1.0 para perseguir.
    //   vel 5..20     (moviendose):     giro normal  0.9/-0.9.
    //   vel < 5       (casi estatico):  giro suave   0.7/-0.7 + avance parcial.
    //
    // Si el rival huia rapido, el tiempo de rastreo se extiende 40%
    // para darle mas margen de alcance antes de rendirse a BUSCAR.
    //
    // Fase 1 (primera mitad): gira hacia giroAlContacto.
    // Fase 2 (segunda mitad): barre al lado contrario.
    // ==================================================

    else if (estado == RASTREAR)
    {
        // Escalar tiempo de rastreo segun velocidad del rival.
        float factorTiempo = 1.0f;
        if (velocidadRival > 20.0f)
            factorTiempo = 1.4f;
        unsigned long tiempoRastreoEfectivo = (unsigned long)(TIEMPO_RASTREO * factorTiempo);

        unsigned long t = millis() - momentoInicioRastreo;

        if (t >= tiempoRastreoEfectivo)
        {
            memoriaContactoValida = false;
            tiempoSinContactoBuscar = millis();
            estado = BUSCAR;
            return;
        }

        // Pivot siempre al maximo — el rastreo debe ser rapido y decisivo.
        // La rueda lenta va negativa para maximizar velocidad angular.
        float vRapida = 1.0f;
        float vLenta = (velocidadRival > 5.0f) ? -1.0f : -0.7f;

        if (t < tiempoRastreoEfectivo / 2)
        {
            setFase(150, 0, 255); // morado brillante: rastreando hacia contacto
            if (giroAlContacto)
                motores(vRapida, vLenta);
            else
                motores(vLenta, vRapida);
        }
        else
        {
            setFase(80, 0, 160); // morado oscuro: barrido lado opuesto
            if (giroAlContacto)
                motores(vLenta, vRapida);
            else
                motores(vRapida, vLenta);
        }
    }

    // ==================================================
    // ATACAR — embestida a velocidad maxima.
    // Anti-deadlock: si el empuje se estanca TIEMPO_STALL ms, hace un juke.
    // Rebote de dojo: si volvio de ESCAPAR en < TIMEOUT_REBOTE_DOJO ms,
    //   hace un giro 180 antes de embestir (el borde era del dojo, no el rival).
    // ==================================================

    else if (estado == ATACAR)
    {
        if (giro180PostEscape)
        {
            giro180PostEscape = false;
            setFase(180, 0, 50); // rojo-magenta: reorientacion post-rebote dojo

            // Retroceso minimo para alejarse del borde antes de girar.
            unsigned long tRetro = millis();
            while (millis() - tRetro < 150)
            {
                leerSensoresIR();
                if (hayBorde())
                {
                    detenerMotores();
                    return;
                }
                motores(-1.0f, -1.0f);
                delay(10);
                yield();
            }

            // Giro 180 alternando lado para no ser predecible.
            motores(jukeIzquierda ? -1.0f : 1.0f, jukeIzquierda ? 1.0f : -1.0f);
            jukeIzquierda = !jukeIzquierda;
            unsigned long tGiro = millis();
            while (millis() - tGiro < TIEMPO_GIRO_180)
            {
                leerSensoresIR();
                if (hayBorde())
                {
                    detenerMotores();
                    return;
                }
                delay(10);
                yield();
            }

            detenerMotores();
            momentoInicioAtaque = millis(); // reiniciar stall timer
            return;
        }

        if (millis() - momentoInicioAtaque > TIEMPO_STALL)
        {
            jukeAtaque();
            momentoInicioAtaque = millis();
            return;
        }
        setFase(255, 0, 0); // rojo: atacando
        motores(1.0f, 1.0f);
    }

    // ==================================================
    // ESCAPAR
    // ==================================================

    else if (estado == ESCAPAR)
    {
        escaparInteligente();
    }

    yield();
}

#pragma endregion

#pragma region SETUP
// ======================================================
// SETUP
// ======================================================

void setup()
{
    Serial.begin(115200);

    pinMode(motorA_IN1, OUTPUT);
    pinMode(motorA_IN2, OUTPUT);
    pinMode(motorB_IN1, OUTPUT);
    pinMode(motorB_IN2, OUTPUT);
    pinMode(BOOT_PIN, INPUT_PULLUP);

    strip.begin();
    strip.show();

    randomSeed(esp_random());
}

#pragma endregion

#pragma region LOOP
// ======================================================
// LOOP
// ======================================================

void loop()
{
    switch (estado)
    {
    case ESPERA:
        esperarBoton();
        break;
    default:
        MainIA();
        break;
    }
}

#pragma endregion
