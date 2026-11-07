package org.apache.datawise.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.ProjectRequestContext;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 解析 {@code X-DataWise-Project-Id} / {@code projectId} / {@code scope=all} 写入 {@link ProjectRequestContext}。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 40)
public class ProjectRequestFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String projectId = request.getHeader(ProjectIds.HEADER);
        if (projectId == null || projectId.isBlank()) {
            projectId = request.getParameter("projectId");
        }
        String scope = request.getHeader(ProjectIds.SCOPE_HEADER);
        if (scope == null || scope.isBlank()) {
            scope = request.getParameter("scope");
        }
        boolean scopeAll = scope != null && "all".equalsIgnoreCase(scope.trim());
        ProjectRequestContext.set(projectId, scopeAll);
        try {
            filterChain.doFilter(request, response);
        } finally {
            ProjectRequestContext.clear();
        }
    }
}
