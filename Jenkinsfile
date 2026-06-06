pipeline {
    agent any

    triggers {
        githubPush()
    }

    environment {
        DOCKER_IMAGE = "pulkit197/fitness_tracker-master-copy3-fitness-app"
        DOCKER_TAG = "${BUILD_NUMBER}"
        EKS_CLUSTER_NAME = "pulkit-cluster"
        AWS_REGION = "us-east-1"
        SECRET_NAME = "fitness-tracker/production/runtime"
        KMS_ALIAS = "alias/fitness-tracker-secrets"
        EXTERNAL_SECRETS_ROLE_ARN = "arn:aws:iam::123456789012:role/fitness-tracker-external-secrets"
    }

    stages {
        stage('Checkout') {
            steps {
                git credentialsId: 'github_credentials',
                    branch: 'master',
                    url: 'https://github.com/Pulkitsriv/Fitness_Tra.git'
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    docker.build("${DOCKER_IMAGE}:${DOCKER_TAG}")
                    docker.build("${DOCKER_IMAGE}:latest")
                }
            }
        }

        stage('Docker Compose Test') {
            steps {
                withCredentials([string(credentialsId: 'datadog-api-key', variable: 'DD_API_KEY')]) {
                    sh '''
                        docker-compose down -v
                        docker-compose build
                        docker-compose up -d

                        sleep 30
                        docker-compose ps

                        i=1
                        while [ $i -le 5 ]; do
                            if curl -f http://localhost:5000 2>/dev/null; then
                                echo "Application is responding"
                                break
                            fi
                            echo "Waiting for application... attempt $i/5"
                            i=$((i+1))
                            sleep 10
                        done

                        docker-compose logs --tail=10 fitness-app
                    '''
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    docker.withRegistry('https://index.docker.io/v1/', 'dockerhub-credentials') {
                        sh """
                            docker push ${DOCKER_IMAGE}:${DOCKER_TAG}
                            docker push ${DOCKER_IMAGE}:latest
                        """
                    }
                }
            }
        }

        stage('Provision Runtime Secrets') {
            steps {
                withAWS(credentials: 'aws-eks-creds', region: "${AWS_REGION}") {
                    withCredentials([
                        string(credentialsId: 'mongodb-uri', variable: 'MONGODB_URI'),
                        string(credentialsId: 'datadog-api-key', variable: 'DD_API_KEY')
                    ]) {
                        sh '''
                            AWS_REGION="${AWS_REGION}" \
                            SECRET_NAME="${SECRET_NAME}" \
                            KMS_ALIAS="${KMS_ALIAS}" \
                            MONGODB_URI="${MONGODB_URI}" \
                            DD_API_KEY="${DD_API_KEY}" \
                            bash scripts/aws-secrets-kms-bootstrap.sh
                        '''
                    }
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                withAWS(credentials: 'aws-eks-creds', region: "${AWS_REGION}") {
                    sh """
                        aws eks update-kubeconfig --region ${AWS_REGION} --name ${EKS_CLUSTER_NAME}

                        helm repo add external-secrets https://charts.external-secrets.io
                        helm upgrade --install external-secrets external-secrets/external-secrets \\
                            --namespace external-secrets \\
                            --create-namespace

                        helm upgrade --install fitness-tracker ./helm \\
                            --namespace fitness-ns \\
                            --create-namespace \\
                            --set image.repository=${DOCKER_IMAGE} \\
                            --set image.tag=${DOCKER_TAG} \\
                            --set aws.region=${AWS_REGION} \\
                            --set aws.roleArn=${EXTERNAL_SECRETS_ROLE_ARN} \\
                            --set externalSecrets.remoteSecretName=${SECRET_NAME}

                        kubectl rollout status deployment/mongodb -n fitness-ns --timeout=300s
                        kubectl rollout status deployment/fitness-tracker-app -n fitness-ns --timeout=300s

                        kubectl get deployments -n fitness-ns
                        kubectl get services -n fitness-ns
                        kubectl get pods -n fitness-ns
                    """
                }
            }
        }

        stage('Get Service URL') {
            steps {
                withAWS(credentials: 'aws-eks-creds', region: "${AWS_REGION}") {
                    sh '''
                        aws eks update-kubeconfig --region "${AWS_REGION}" --name "${EKS_CLUSTER_NAME}"

                        i=1
                        while [ $i -le 10 ]; do
                            external_ip=$(kubectl get service fitness-tracker-service -n fitness-ns -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
                            external_hostname=$(kubectl get service fitness-tracker-service -n fitness-ns -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)

                            if [ -n "$external_ip" ]; then
                                echo "Application URL: http://$external_ip"
                                break
                            elif [ -n "$external_hostname" ]; then
                                echo "Application URL: http://$external_hostname"
                                break
                            fi

                            echo "Waiting for LoadBalancer... attempt $i/10"
                            i=$((i+1))
                            sleep 20
                        done

                        kubectl get service fitness-tracker-service -n fitness-ns
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "Deployment successful."
        }
        failure {
            echo "Deployment failed."
        }
        always {
            sh 'docker-compose down -v || true'
        }
    }
}
