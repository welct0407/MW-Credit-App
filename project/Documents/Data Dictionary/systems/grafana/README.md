# Grafana ownership

Grafana monitoring is deployed and its adopted infrastructure is Terraform-managed in MW-Credit-App. This namespace does not duplicate the maintained Terraform/dashboard sources.

Use the [visual guide](../../../Resource_Monitoring_Dashboard_Guide.md), [operations](../../../Resource_Monitoring.md) and [adoption matrix](../../../../outputs/r057-infrastructure-adoption/README.md) for current coverage and source ownership. Add dictionary objects only when useful; credentials and secure datasource payloads stay outside Git.