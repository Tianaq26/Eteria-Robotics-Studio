# Sumobot — CircuitPython (misma API que el robot real)
# Programa con la MISMA API que el robot real: lo que funciona aqui, funciona alla.
import board
from ideaboard import IdeaBoard
from time import sleep
from hcsr04 import HCSR04

ib = IdeaBoard()
sonar = HCSR04(board.IO25, board.IO26)
# Sensores IR:  FL=IO36  FR=IO39  BL=IO34  BR=IO35
fl = ib.AnalogIn(board.IO36)
fr = ib.AnalogIn(board.IO39)
bl = ib.AnalogIn(board.IO34)
br = ib.AnalogIn(board.IO35)

BLANCO = 3000  # valor critico IR: value < BLANCO  =>  linea blanca (borde)

def en_borde():
    return fl.value < BLANCO or fr.value < BLANCO or bl.value < BLANCO or br.value < BLANCO

while True:
    if en_borde():
        ib.pixel = (255, 0, 0)
        ib.motor_1.throttle = -1            # retrocede
        ib.motor_2.throttle = -1
        sleep(0.2)
    elif 0 < sonar.dist_cm() < 50:
        ib.pixel = (0, 255, 0)
        ib.motor_1.throttle = 1             # embiste
        ib.motor_2.throttle = 1
    else:
        ib.pixel = (0, 0, 255)
        ib.motor_1.throttle = 1             # busca en arco
        ib.motor_2.throttle = 0.3
    sleep(0.02)
