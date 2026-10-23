import unittest

from backend.alerta import normalizar_prioridade


class NormalizarPrioridadeTests(unittest.TestCase):
    def test_usa_prioridades_oficiais(self):
        for entrada, esperada in (
            ("Zona Segura", "Zona Segura"),
            ("Atenção Crítica", "Atenção Crítica"),
            ("Estado de Alerta", "Estado de Alerta"),
            ("Alerta Máximo", "Alerta Máximo"),
        ):
            with self.subTest(entrada=entrada):
                self.assertEqual(normalizar_prioridade(entrada), esperada)

    def test_converte_prioridades_legadas_sem_perder_severidade(self):
        for entrada, esperada in (
            ("BAIXA", "Zona Segura"),
            ("MEDIA", "Atenção Crítica"),
            ("ALTA", "Estado de Alerta"),
            ("CRITICA", "Alerta Máximo"),
        ):
            with self.subTest(entrada=entrada):
                self.assertEqual(normalizar_prioridade(entrada), esperada)


if __name__ == "__main__":
    unittest.main()
