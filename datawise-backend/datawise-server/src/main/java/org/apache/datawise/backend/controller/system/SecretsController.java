package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.domain.SecretsStatusDto;
import org.apache.datawise.backend.security.MasterKeyService;
import org.apache.datawise.backend.security.MasterKeySource;
import org.apache.datawise.backend.security.SecretReferenceResolver;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/system")
public class SecretsController {

    private final MasterKeyService masterKeyService;
    private final UserAccessPolicy userAccessPolicy;

    public SecretsController(MasterKeyService masterKeyService, UserAccessPolicy userAccessPolicy) {
        this.masterKeyService = masterKeyService;
        this.userAccessPolicy = userAccessPolicy;
    }

    @GetMapping("/secrets")
    public ApiResponse<SecretsStatusDto> secretsStatus() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        MasterKeySource source = masterKeyService.source();
        return ApiResponse.ok(new SecretsStatusDto(
                source.name(),
                source == MasterKeySource.ENV,
                List.of(
                        SecretReferenceResolver.SCHEME_ENV,
                        SecretReferenceResolver.SCHEME_FILE,
                        SecretReferenceResolver.SCHEME_JSON_FILE,
                        SecretReferenceResolver.SCHEME_PROPERTIES,
                        SecretReferenceResolver.SCHEME_DOTENV,
                        SecretReferenceResolver.SCHEME_VAULT
                ),
                "Store dwsecret:env:NAME, dwsecret:file:path, dwsecret:json-file:path#field, "
                        + "dwsecret:properties:path#key, dwsecret:dotenv:path#KEY, or dwsecret:vault:path#field "
                        + "(Vault KV via VAULT_ADDR/VAULT_TOKEN) instead of plaintext in connections.xml"
        ));
    }
}
