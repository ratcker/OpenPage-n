from copy import deepcopy
import json
import os
from pathlib import Path
import re
import subprocess
import unittest

import yaml


CHART = Path(__file__).resolve().parents[1]
HELM = os.environ.get("HELM", "helm")


class TestRender(unittest.TestCase):
    def setUp(self):
        self.values = yaml.safe_load((CHART / "tests/values-two-services.yaml").read_text())

    def helm(self, values):
        return subprocess.run(
            [HELM, "template", "sandbox", str(CHART), "--namespace", "sandbox", "-f", "-"],
            input=json.dumps(values),
            text=True,
            capture_output=True,
        )

    def render(self, values):
        result = self.helm(values)
        self.assertEqual(result.returncode, 0, result.stderr)
        return [doc for doc in yaml.safe_load_all(result.stdout) if doc]

    def test_two_services(self):
        docs = self.render(self.values)
        self.assertCountEqual(
            [doc["kind"] for doc in docs],
            ["Deployment", "Deployment", "Service", "Service", "HTTPRoute"],
        )
        self.assertTrue(all(doc["metadata"]["namespace"] == "sandbox" for doc in docs))
        services = {doc["metadata"]["name"]: doc["spec"] for doc in docs if doc["kind"] == "Service"}
        backend_names = {}
        for doc in docs:
            if doc["kind"] != "Deployment":
                continue
            spec = doc["spec"]
            pod = spec["template"]
            container, = pod["spec"]["containers"]
            config = self.values["services"][container["name"]]
            resource_name = doc["metadata"]["name"]
            backend_names[container["name"]] = resource_name
            self.assertEqual(spec["replicas"], config["replicas"])
            self.assertEqual(spec["progressDeadlineSeconds"], 600)
            self.assertEqual(spec["strategy"]["rollingUpdate"], {"maxSurge": 1, "maxUnavailable": 0})
            self.assertEqual(container["image"], config["image"])
            self.assertEqual(container["resources"], config["resources"])
            self.assertEqual(container.get("readinessProbe"), config.get("readinessProbe"))
            labels = spec["selector"]["matchLabels"]
            self.assertEqual(labels, pod["metadata"]["labels"])
            self.assertEqual(labels, services[resource_name]["selector"])
            self.assertEqual(labels["openpage/project-id"], self.values["project"]["id"])
            self.assertEqual(labels["app.kubernetes.io/name"], container["name"])
            self.assertEqual(pod["metadata"]["annotations"], {
                "openpage/source-sha": self.values["project"]["sourceSHA"],
                "openpage/config-revision": self.values["project"]["configRevision"],
            })
            self.assertEqual(services[resource_name]["type"], "ClusterIP")
            self.assertEqual(services[resource_name]["ports"], [{"port": config["port"], "targetPort": config["port"]}])
            self.assertTrue(pod["spec"]["securityContext"]["runAsNonRoot"])
            self.assertEqual(pod["spec"]["securityContext"]["seccompProfile"]["type"], "RuntimeDefault")
            self.assertFalse(pod["spec"]["automountServiceAccountToken"])
            self.assertFalse(container["securityContext"]["allowPrivilegeEscalation"])
            self.assertEqual(container["securityContext"]["capabilities"]["drop"], ["ALL"])
            if "env" in config:
                self.assertEqual({item["name"]: item["value"] for item in container["env"]}, config["env"])

        route_doc, = (doc for doc in docs if doc["kind"] == "HTTPRoute")
        self.assertEqual(route_doc["apiVersion"], "gateway.networking.k8s.io/v1")
        route = route_doc["spec"]
        self.assertEqual(route["parentRefs"], [self.values["gateway"]])
        self.assertEqual(route["hostnames"], [self.values["project"]["hostname"]])
        self.assertEqual(route["rules"], [
            {
                "matches": [{"path": {"type": "PathPrefix", "value": item["path"]}}],
                "backendRefs": [{
                    "name": backend_names[item["service"]],
                    "port": self.values["services"][item["service"]]["port"],
                }],
            }
            for item in self.values["routes"]
        ])

    def test_internal_service_and_worker(self):
        backend = self.values["services"]["backend"]
        self.values["services"] = {
            "a" * 62 + "b": backend,
            "a" * 62 + "c": {
                "image": backend["image"],
                "replicas": 0,
                "resources": backend["resources"],
            },
        }
        self.values["routes"] = []
        self.values["gateway"] = {}
        docs = self.render(self.values)
        self.assertCountEqual([doc["kind"] for doc in docs], ["Deployment", "Deployment", "Service"])
        deployments = [doc for doc in docs if doc["kind"] == "Deployment"]
        self.assertCountEqual([doc["spec"]["replicas"] for doc in deployments], [0, 1])
        names = [doc["metadata"]["name"] for doc in deployments]
        self.assertEqual(len(set(names)), 2)
        self.assertTrue(all(re.fullmatch(r"[a-z][a-z0-9-]{0,62}", name) for name in names))
        self.values["project"]["configRevision"] = "revision-2"
        self.assertEqual(
            names,
            [doc["metadata"]["name"] for doc in self.render(self.values) if doc["kind"] == "Deployment"],
        )

    def test_invalid_route_links(self):
        route = self.values["routes"][1]
        route["service"] = "missing"
        self.assertIn("references unknown service", self.helm(self.values).stderr)
        route["service"] = "backend"
        del self.values["services"]["backend"]["port"]
        self.assertIn("requires a port", self.helm(self.values).stderr)
        self.values["services"]["backend"]["port"] = 8000
        self.values["routes"].append({"path": "/api/", "service": "backend"})
        self.assertIn("duplicate route path prefix", self.helm(self.values).stderr)

    def test_invalid_values(self):
        for key, invalid in [
            ("image", "ghcr.io/example/frontend:latest"),
            ("port", 0),
            ("replicas", -1),
            ("resources", {"requests": {"cpu": "100m"}}),
        ]:
            with self.subTest(key=key):
                values = deepcopy(self.values)
                values["services"]["frontend"][key] = invalid
                self.assertNotEqual(self.helm(values).returncode, 0)

        for key, invalid in [
            ("gateway", {}),
            ("routes", [{"path": "/api//v1", "service": "backend"}]),
        ]:
            with self.subTest(key=key):
                values = dict(self.values, **{key: invalid})
                self.assertNotEqual(self.helm(values).returncode, 0)

        values = dict(self.values, routes=[], services={"INVALID": self.values["services"]["frontend"]})
        self.assertNotEqual(self.helm(values).returncode, 0)


if __name__ == "__main__":
    unittest.main()
